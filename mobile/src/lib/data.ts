import { and, desc, eq, gte, lt } from "drizzle-orm";
import { accounts, budgets, loans, offers, rewards, syncState, transactions } from "@/db/schema";
import { cycleBudget, debtPayoff, expectedPayday, type CycleBudget } from "@/lib/budget";
import { formatMoney } from "@/lib/format";
import { shortAccountName } from "@/lib/feed";
import { pace } from "@/lib/pace";
import { ESSENTIAL_BUDGETS, realityCheck } from "@/lib/reality";
import { streak } from "@/lib/streaks";
import { paymentDates } from "@/lib/loans";
import { categorize } from "@/lib/categories";
import { detectSubscriptions } from "@/lib/subscriptions";
import { db } from "@m/db";
import { getState, setState } from "./state";

// Запити для екранів і сповіщень

// ---- Налаштування циклу ----
export const settings = {
  paydayDay: () => getState<number>("settings:paydayDay") ?? 9,
  savings: () => getState<number>("settings:savings") ?? 1_000_000, // 10 000 ₴ відкладати з кожної ЗП
  challengeCategory: () => getState<string>("settings:challenge") ?? "Перекуси й напої",
};

export { paymentDates } from "@/lib/loans";

export function loanPaymentsBetween(fromMs: number, toMs: number) {
  return allLoans().reduce(
    (sum, l) => sum + paymentDates(l.startDate, l.termMonths).filter((d) => d.getTime() >= fromMs && d.getTime() < toMs).length * l.monthlyPayment,
    0,
  );
}

/** Скільки спишуть розстрочки за найближчі N днів */
export function loansNextDays(days: number) {
  const now = Date.now();
  return loanPaymentsBetween(now, now + days * 86_400_000);
}

/** Середня ЗП за останні 3 виплати — коли в поточному циклі ще не прийшла */
function averageSalary() {
  const rows = db
    .select({ amount: transactions.amount })
    .from(transactions)
    .where(and(eq(transactions.category, "Зарплата"), gte(transactions.amount, 0)))
    .orderBy(desc(transactions.time))
    .limit(3)
    .all();
  return rows.length ? Math.round(rows.reduce((s, r) => s + r.amount, 0) / rows.length) : 3_900_000;
}

/** Остання ЗП: зафіксована вручну/пушем або знайдена серед операцій — що новіше */
function lastSalary() {
  const manual = getState<{ amount: number; at: number }>("salary:last");
  const tx = db
    .select({ amount: transactions.amount, time: transactions.time })
    .from(transactions)
    .where(and(eq(transactions.category, "Зарплата"), gte(transactions.amount, 0)))
    .orderBy(desc(transactions.time))
    .limit(1)
    .get();
  const fromTx = tx ? { amount: tx.amount, at: tx.time * 1000 } : null;
  if (!manual) return fromTx;
  if (!fromTx) return manual;
  return fromTx.at > manual.at ? fromTx : manual;
}

/** Власні гроші зараз: баланси мінус кредитні ліміти й борги, тільки гривня */
export function ownNow() {
  return allAccounts()
    .filter((a) => a.currency === "UAH")
    .reduce((s, a) => s + a.own, 0);
}

/** Власні гроші на момент fromMs = зараз мінус усе, що прийшло/пішло відтоді */
function carryAt(fromMs: number) {
  const uah = new Set(allAccounts().filter((a) => a.currency === "UAH").map((a) => a.id));
  const flow = db
    .select({ amount: transactions.amount, accountId: transactions.accountId })
    .from(transactions)
    .where(gte(transactions.time, Math.floor(fromMs / 1000)))
    .all()
    .filter((t) => uah.has(t.accountId))
    .reduce((s, t) => s + t.amount, 0);
  return ownNow() - flow;
}

/** essentialOnly — режим «тільки обов'язкове» (вмикає picture(), коли реальних грошей до ЗП нема) */
export function currentBudget(now = new Date(), essentialOnly = false): CycleBudget {
  const since = Math.floor(now.getTime() / 1000) - 45 * 86_400;
  const txs = db
    .select({ time: transactions.time, amount: transactions.amount, category: transactions.category, isTransfer: transactions.isTransfer })
    .from(transactions)
    .where(gte(transactions.time, since))
    .all();
  return cycleBudget(
    db.select().from(budgets).all(),
    txs,
    {
      paydayDay: settings.paydayDay(),
      savings: settings.savings(),
      salary: lastSalary(),
      fallbackIncome: averageSalary(),
      loanPaymentsBetween,
      carryAt,
      essentialOnly: essentialOnly ? ESSENTIAL_BUDGETS : undefined,
    },
    now,
  );
}

/**
 * Реальність: власні гроші на рахунках мінус те, що ТОЧНО спишеться до наступної ЗП
 * (розстрочки, підписки, відкладання, якщо ЗП вже прийшла, а ще не відклав),
 * плюс мінус, який план дозволяє лишити на наступну ЗП (режим «спершу борг»).
 * «Можна сьогодні» = менше з плану й реальності.
 */
export function picture(now = new Date()) {
  let budget = currentBudget(now);
  const nowMs = now.getTime();
  const toMs = budget.to.getTime();
  const own = ownNow();
  const loansLeft = loanPaymentsBetween(nowMs, toMs);
  const subsLeft = subscriptions()
    .filter((x) => x.nextAt * 1000 >= nowMs && x.nextAt * 1000 < toMs)
    .reduce((s, x) => s + x.lastAmount, 0);
  // Скільки цього циклу вже відкладено: поповнення власних банок моно ("На банку «…»")
  const saved = db
    .select({ amount: transactions.amount, description: transactions.description })
    .from(transactions)
    .where(and(gte(transactions.time, Math.floor(budget.from.getTime() / 1000)), lt(transactions.amount, 0)))
    .all()
    .filter((t) => isJarTopUp(t.description))
    .reduce((s, t) => s - t.amount, 0);
  const savingsLeft = budget.incomeKnown ? Math.max(0, budget.savings - saved) : 0;
  const reserve = loansLeft + subsLeft + savingsLeft;
  // ЗП запізнюється — цикл уже рахується від неї, тож очікувану суму додаємо
  const pending = budget.incomeKnown ? 0 : budget.income;
  const free = own + pending - reserve + budget.debtAfter;
  const realSafe = Math.max(0, Math.floor(free / budget.daysLeft));
  // Реальних грошей до ЗП нема → «тільки обов'язкове»: решта бюджетів заморожується,
  // а на їжу/дорогу/ліки показуємо, скільки можна на день (це вже в борг, але чесно)
  if (free < 0) budget = currentBudget(now, true);
  const essentialDaily = budget.essentialOnly
    ? Math.floor(budget.budgets.filter((b) => ESSENTIAL_BUDGETS.has(b.id)).reduce((s, b) => s + Math.max(0, b.left), 0) / budget.daysLeft)
    : 0;
  return { budget, own, loansLeft, subsLeft, saved, savingsLeft, reserve, pending, free, realSafe, essentialDaily, safe: Math.min(budget.safeToday, realSafe) };
}

/**
 * Прогноз: скільки буде власних на день ЗП при нинішньому темпі (14 днів), скільки лишиться після ЗП
 * і після якої ЗП закриється мінус, якщо далі жити в межах лімітів.
 */
export function forecast(now = new Date()) {
  const pic = picture(now);
  const b = pic.budget;
  const cats = new Set(b.budgets.flatMap((x) => x.categories));
  const spent14 = db
    .select({ amount: transactions.amount, category: transactions.category, isTransfer: transactions.isTransfer })
    .from(transactions)
    .where(and(gte(transactions.time, Math.floor(now.getTime() / 1000) - 14 * 86_400), lt(transactions.amount, 0)))
    .all()
    .filter((t) => !t.isTransfer && cats.has(t.category))
    .reduce((s, t) => s - t.amount, 0);
  const daily = Math.round(spent14 / 14);
  const spendAhead = daily * b.daysLeft;
  const atPayday = pic.own + pic.pending - pic.loansLeft - pic.subsLeft - pic.savingsLeft - spendAhead;
  const income = averageSalary();
  const payday = (k: number) => expectedPayday(b.to.getFullYear(), b.to.getMonth() + k, settings.paydayDay());
  const payoff = atPayday < 0 ? debtPayoff({ debt: -atPayday, income, planned: b.planned, loansFor: (k) => loanPaymentsBetween(payday(k).getTime(), payday(k + 1).getTime()) }) : 0;
  return {
    daily,
    spendAhead,
    atPayday,
    income,
    afterSalary: atPayday + income,
    /** після якої ЗП мінус = 0; null — при таких лімітах не закривається */
    debtFreeAt: payoff === null ? null : payoff === 0 ? undefined : payday(payoff - 1),
  };
}

/** Перевірки на реалізм: план проти реальних витрат за 3 місяці, коливань ЗП і кредитного ліміту */
export function reality(now = new Date()) {
  const fc = forecast(now);
  const b = currentBudget(now);
  const cats = new Set(b.budgets.flatMap((x) => x.categories));
  const nowS = Math.floor(now.getTime() / 1000);
  const trend90 = db
    .select({ amount: transactions.amount, category: transactions.category, isTransfer: transactions.isTransfer })
    .from(transactions)
    .where(and(gte(transactions.time, nowS - 90 * 86_400), lt(transactions.amount, 0)))
    .all()
    .filter((t) => !t.isTransfer && cats.has(t.category))
    .reduce((s, t) => s - t.amount, 0);
  const incomes = db
    .select({ amount: transactions.amount })
    .from(transactions)
    .where(and(eq(transactions.category, "Зарплата"), gte(transactions.amount, 0)))
    .orderBy(desc(transactions.time))
    .limit(3)
    .all()
    .map((x) => x.amount);
  const credit = allAccounts().filter((a) => a.creditLimit > 0);
  const fees = db
    .select({ amount: transactions.amount, description: transactions.description })
    .from(transactions)
    .where(and(gte(transactions.time, nowS - 365 * 86_400), lt(transactions.amount, 0)))
    .all()
    .filter((t) => /перевищення кредитного ліміту/i.test(t.description))
    .reduce((s, t) => s - t.amount, 0);
  const payday = (k: number) => expectedPayday(b.to.getFullYear(), b.to.getMonth() + k, settings.paydayDay());
  return realityCheck({
    savingsTarget: settings.savings(),
    planned: b.planned,
    trendMonthly: Math.round(trend90 / 3),
    incomes,
    holeAtPayday: Math.max(0, -fc.atPayday),
    creditLimit: credit.reduce((s, a) => s + a.creditLimit, 0),
    overLimitNow: credit.reduce((s, a) => s + Math.max(0, -(a.balance ?? 0)), 0),
    overLimitFees12m: fees,
    loansFor: (k) => loanPaymentsBetween(payday(k).getTime(), payday(k + 1).getTime()),
  });
}

/** Темп циклу: витрачено по бюджетах vs скільки циклу минуло */
export function cyclePace(budget = currentBudget(), now = new Date()) {
  return pace({ spent: budget.totalSpent, limit: budget.totalLimit, from: budget.from, to: budget.to, now });
}

/** Короткі назви рахунків для чипів і підписів: id → «моно black» */
export function accountNames() {
  const list = db.select().from(accounts).all();
  return new Map(list.map((a) => [a.id, shortAccountName(a, list)]));
}

/** Зафіксувати ЗП (з пушу банку, з API або вручну) */
export function recordSalary(amount: number, at = Date.now()) {
  setState("salary:last", { amount, at });
}

// ---- Ручні витрати й готівка ----
export const CASH_ACCOUNT = "cash:main";

export function addManual(o: { amount: number; category: string; description: string; accountId: string; time?: number }) {
  if (o.accountId === CASH_ACCOUNT) {
    db.insert(accounts).values({ id: CASH_ACCOUNT, bank: "cash", name: "Готівка", currency: "UAH" }).onConflictDoNothing().run();
  }
  const row = {
    id: `manual:${Date.now()}`,
    accountId: o.accountId,
    bank: o.accountId.split(":")[0] as "mono" | "ukrsib" | "pumb" | "cash",
    time: o.time ?? Math.floor(Date.now() / 1000),
    amount: o.amount,
    description: o.description || o.category,
    category: o.category || categorize(null, o.description),
    categoryLocked: true,
  };
  db.insert(transactions).values(row).run();
  return row;
}

/** Поповнення власної банки моно = відкладання */
export const isJarTopUp = (description: string) => /^на банку/i.test(description);

/** Усього відкладено: сума всіх власних банок моно */
export function savedTotal() {
  return (getState<{ balance: number }[]>("mono:jars") ?? []).reduce((s, j) => s + j.balance, 0);
}

// ---- Серії: тільки утримання й відкладання ----
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000;

export function streaks(now = new Date()) {
  const budget = currentBudget(now);
  const budgetCats = new Set(budget.budgets.flatMap((b) => b.categories));
  const cycleDays = Math.max(1, Math.round((budget.to.getTime() - budget.from.getTime()) / 86_400_000));
  const dailyLimit = budget.totalLimit / cycleDays;
  const snackCat = settings.challengeCategory();

  // 60 днів назад від учора (сьогодні ще не закінчився)
  const since = dayStart(now) - 60 * 86_400;
  const rows = db
    .select({ time: transactions.time, amount: transactions.amount, category: transactions.category, isTransfer: transactions.isTransfer })
    .from(transactions)
    .where(and(gte(transactions.time, since), lt(transactions.amount, 0)))
    .all()
    .filter((t) => !t.isTransfer);
  const spentByDay = new Map<number, { budget: number; snacks: number }>();
  for (const t of rows) {
    const key = Math.floor((dayStart(now) - dayStart(new Date(t.time * 1000))) / 86_400);
    const v = spentByDay.get(key) ?? { budget: 0, snacks: 0 };
    if (budgetCats.has(t.category)) v.budget -= t.amount;
    if (t.category === snackCat) v.snacks -= t.amount;
    spentByDay.set(key, v);
  }
  const lastDays = Array.from({ length: 60 }, (_, i) => spentByDay.get(i + 1) ?? { budget: 0, snacks: 0 });

  // Цикли ЗП, у яких відклав не менше плану
  const savings = settings.savings();
  const cycles = Array.from({ length: 12 }, (_, k) => {
    const from = expectedPayday(now.getFullYear(), now.getMonth() - k - 1, settings.paydayDay()).getTime() / 1000;
    const to = expectedPayday(now.getFullYear(), now.getMonth() - k, settings.paydayDay()).getTime() / 1000;
    const saved = db
      .select({ amount: transactions.amount, description: transactions.description })
      .from(transactions)
      .where(and(gte(transactions.time, from), lt(transactions.time, to), lt(transactions.amount, 0)))
      .all()
      .filter((t) => isJarTopUp(t.description))
      .reduce((s, t) => s - t.amount, 0);
    return saved >= savings;
  });

  return {
    withinLimit: streak(lastDays.map((d) => d.budget <= dailyLimit)),
    noSnacks: streak(lastDays.map((d) => d.snacks === 0)),
    savedCycles: streak(cycles, 0),
    dailyLimit,
    snackCategory: snackCat,
  };
}

/** Підписи серій — одні й ті самі для екрана, віджета й сповіщень */
export function streakLines(st = streaks()) {
  return [
    { key: "limit", days: st.withinLimit.days, label: `${st.withinLimit.days} дн. у межах денного ліміту` },
    { key: "snacks", days: st.noSnacks.days, label: `${st.noSnacks.days} дн. без «${st.snackCategory.toLowerCase()}»` },
    { key: "saved", days: st.savedCycles.days, label: `${st.savedCycles.days} зп поспіль відкладено ${formatMoney(settings.savings())}` },
  ];
}

// ---- Підписки ----
export function subscriptions() {
  const since = Math.floor(Date.now() / 1000) - 200 * 86_400;
  const hidden = new Set(getState<string[]>("subs:hidden") ?? []);
  return detectSubscriptions(db.select().from(transactions).where(gte(transactions.time, since)).all()).filter((s) => !hidden.has(s.key));
}

export function hideSubscription(key: string) {
  setState("subs:hidden", [...(getState<string[]>("subs:hidden") ?? []), key]);
}

/** Активні рахунки (без архівних, напр. закритого Укрсибу без API) — для бюджету й "власних грошей" */
export function allAccounts() {
  return db
    .select()
    .from(accounts)
    .where(eq(accounts.archived, false))
    .all()
    .map((a) => ({ ...a, own: (a.balance ?? 0) - a.creditLimit - a.debt }));
}

/** Архівні рахунки — лишаються для історії транзакцій, у "власних грошах" не враховуються */
export function archivedAccounts() {
  return db
    .select()
    .from(accounts)
    .where(eq(accounts.archived, true))
    .all()
    .map((a) => ({ ...a, own: (a.balance ?? 0) - a.creditLimit - a.debt }));
}

/** Позначити рахунок архівним/активним (не видаляє — історія транзакцій лишається) */
export function setArchived(id: string, archived: boolean) {
  db.update(accounts).set({ archived }).where(eq(accounts.id, id)).run();
}

export function recentTransactions(limit = 200) {
  return db.select().from(transactions).orderBy(desc(transactions.time)).limit(limit).all();
}

export function allLoans() {
  return db.select().from(loans).all();
}

/** Видалити операцію (для «скасувати» після ручного додавання) */
export function deleteTransaction(id: string) {
  db.delete(transactions).where(eq(transactions.id, id)).run();
}

export function setCategory(id: string, category: string) {
  db.update(transactions).set({ category, categoryLocked: true }).where(eq(transactions.id, id)).run();
}

/** Усі категорії, що трапляються в бюджетах і операціях — для вибору при зміні */
export function allCategories() {
  const fromBudgets = db.select().from(budgets).all().flatMap((b) => b.categories);
  const fromTx = db.selectDistinct({ c: transactions.category }).from(transactions).all().map((r) => r.c);
  return [...new Set([...fromBudgets, ...fromTx])].sort((a, b) => a.localeCompare(b, "uk"));
}

export function setBudgetLimit(id: string, limitUah: number) {
  db.update(budgets).set({ limitUah }).where(eq(budgets.id, id)).run();
}

export function addLoan(loan: typeof loans.$inferInsert) {
  db.insert(loans).values(loan).run();
}

export function deleteLoan(id: number) {
  db.delete(loans).where(eq(loans.id, id)).run();
}

/** Знімок бази в тому ж форматі, що й експорт з Mac (version 1) — для бекапу */
export function snapshot() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: "phone",
    accounts: db.select().from(accounts).all(),
    transactions: db.select().from(transactions).all(),
    loans: db.select().from(loans).all(),
    budgets: db.select().from(budgets).all(),
    rewards: db.select().from(rewards).all(),
    offers: db.select().from(offers).all(),
    syncState: db.select().from(syncState).all(),
  };
}
