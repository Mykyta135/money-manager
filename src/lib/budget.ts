import type { Budget } from "@/db/schema";

// Чиста логіка бюджету — працює і на Mac, і в мобільній апці (без доступу до БД)

export type MonthTx = { amount: number; category: string; isTransfer: boolean };

export type BudgetStatus = Budget & { spent: number; left: number; pct: number };

export type BudgetSummary = {
  budgets: BudgetStatus[];
  totalLimit: number;
  totalSpent: number;
  daysLeft: number; // включно з сьогодні
  safeToday: number; // скільки можна витратити сьогодні по всіх бюджетах, копійки
};

export function monthRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { from: Math.floor(start.getTime() / 1000), to: Math.floor(end.getTime() / 1000) };
}

export function budgetSummary(list: Budget[], monthTxs: MonthTx[], now = new Date()): BudgetSummary {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate() + 1;

  const budgets = [...list]
    .sort((a, b) => a.sort - b.sort)
    .map((b) => {
      const spent = monthTxs
        .filter((t) => t.amount < 0 && !t.isTransfer && b.categories.includes(t.category))
        .reduce((s, t) => s - t.amount, 0);
      return { ...b, spent, left: b.limitUah - spent, pct: b.limitUah ? spent / b.limitUah : 0 };
    });

  const totalLimit = budgets.reduce((s, b) => s + b.limitUah, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  // Перевитрата в одній категорії з'їдає запас інших — тому рахуємо по сумі, а не по кожній окремо
  const safeToday = Math.max(0, Math.floor((totalLimit - totalSpent) / daysLeft));

  return { budgets, totalLimit, totalSpent, daysLeft, safeToday };
}

// ---- Цикл «від зарплати до зарплати» ----
// ЗП приходить ~7–9 числа, сума плаває. Правило: спершу відкладаємо savings (10 000),
// потім платежі по розстрочках до наступної ЗП, решта — на життя.

const DAY_MS = 86_400_000;

/** Очікувана дата ЗП у місяці: payday-число, а якщо вихідний — найближчий понеділок */
export function expectedPayday(year: number, month: number, paydayDay: number) {
  const d = new Date(year, month, paydayDay);
  if (d.getDay() === 6) d.setDate(d.getDate() + 2);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d;
}

export type CycleOptions = {
  paydayDay: number; // 9
  savings: number; // копійки, 10 000 ₴ → 1_000_000
  salary: { amount: number; at: number } | null; // остання фактична ЗП (at — unix ms)
  fallbackIncome: number; // якщо ЗП в цьому циклі ще не прийшла — середня за 3 міс
  loanPaymentsBetween: (fromMs: number, toMs: number) => number; // копійки
  /** Власні гроші на початок циклу (до ЗП). Мінус = борг на картці, який ЗП закриває першою */
  carryAt?: (fromMs: number) => number;
  /** «Тільки обов'язкове»: бюджети не з цього списку заморожуються на вже витраченому */
  essentialOnly?: Set<string>;
};

export type Allocation = {
  savings: number; // скільки реально відкласти цього циклу
  life: number; // на життя (сума лімітів після урізання)
  scale: number; // у скільки разів урізані ліміти (1 = як заплановано)
  paydown: number; // скільки мінусу закриває ця ЗП
  debtAfter: number; // мінус, що лишиться на наступну ЗП
  surplus: number; // залишок понад усе — можна докласти в банку
  shortfall: number; // скільки бракує навіть на розстрочки (і 10k, коли боргу нема)
};

/**
 * Розподіл ЗП.
 * Є мінус → «спершу борг»: розстрочки, життя в межах лімітів, закрити мінус, і тільки залишок — відкласти.
 * Нема мінуса → «спершу себе»: відкласти ціль, розстрочки, решта на життя (ліміти урізаються під неї).
 */
export function allocate(o: { income: number; loans: number; planned: number; savingsTarget: number; debt: number }): Allocation {
  const afterLoans = o.income - o.loans;
  const fit = (life: number) => (o.planned > 0 ? Math.max(0, Math.min(1, life / o.planned)) : 1);
  if (o.debt > 0) {
    const life = Math.max(0, Math.min(o.planned, afterLoans));
    const rest = Math.max(0, afterLoans - life);
    const paydown = Math.min(o.debt, rest);
    const savings = Math.min(o.savingsTarget, rest - paydown);
    return { savings, life, scale: fit(life), paydown, debtAfter: o.debt - paydown, surplus: rest - paydown - savings, shortfall: Math.max(0, -afterLoans) };
  }
  const savings = Math.min(o.savingsTarget, Math.max(0, afterLoans));
  const life = afterLoans - o.savingsTarget;
  return { savings, life, scale: fit(life), paydown: 0, debtAfter: 0, surplus: Math.max(0, life - o.planned), shortfall: Math.max(0, -life) };
}

/**
 * Через скільки ЗП закриється мінус, якщо жити в межах лімітів.
 * loansFor(k) — розстрочки в k-му циклі від наступної ЗП (0 — найближчий). null — не закривається за horizon циклів.
 */
export function debtPayoff(o: { debt: number; income: number; planned: number; loansFor: (k: number) => number; horizon?: number }) {
  let debt = o.debt;
  for (let k = 0; k < (o.horizon ?? 36); k++) {
    if (debt <= 0) return k;
    debt = allocate({ income: o.income, loans: o.loansFor(k), planned: o.planned, savingsTarget: 0, debt }).debtAfter;
  }
  return debt <= 0 ? (o.horizon ?? 36) : null;
}

export type CycleBudget = BudgetSummary & {
  from: Date;
  to: Date; // очікувана наступна ЗП
  income: number;
  incomeKnown: boolean;
  loans: number;
  savingsTarget: number; // ціль із налаштувань (10 000)
  debt: number; // мінус на картці на початок циклу
  planned: number; // сума лімітів без урізання
  essentialOnly: boolean;
} & Allocation;

export function cycleBudget(list: Budget[], txs: (MonthTx & { time: number })[], o: CycleOptions, now = new Date()): CycleBudget {
  // Початок циклу — фактична ЗП, якщо вона була за останні 40 днів, інакше очікувана дата
  let recentSalary = o.salary && now.getTime() - o.salary.at < 40 * DAY_MS ? o.salary : null;
  const cycle = (start: Date) => {
    const from = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    return { from, to: expectedPayday(from.getFullYear(), from.getMonth() + 1, o.paydayDay) };
  };
  const expected = () => {
    const d = expectedPayday(now.getFullYear(), now.getMonth(), o.paydayDay);
    return d > now ? expectedPayday(now.getFullYear(), now.getMonth() - 1, o.paydayDay) : d;
  };
  let { from, to } = cycle(recentSalary ? new Date(recentSalary.at) : expected());
  // ЗП запізнюється: минулий цикл уже скінчився → новий від очікуваної дати, дохід поки невідомий
  if (recentSalary && to <= now) {
    recentSalary = null;
    ({ from, to } = cycle(expected()));
  }

  const income = recentSalary?.amount ?? o.fallbackIncome;
  const loans = o.loanPaymentsBetween(from.getTime(), to.getTime());
  const planned = list.reduce((s, b) => s + b.limitUah, 0);
  const debt = Math.max(0, -(o.carryAt?.(from.getTime()) ?? 0));
  const alloc = allocate({ income, loans, planned, savingsTarget: o.savings, debt });
  const scaled = list.map((b) => ({ ...b, limitUah: Math.round(b.limitUah * alloc.scale) }));

  const inCycle = txs.filter((t) => t.time * 1000 >= from.getTime() && t.time * 1000 < to.getTime());
  let base = budgetSummary(scaled, inCycle, now);
  if (o.essentialOnly) {
    const ess = o.essentialOnly;
    const frozen = scaled.map((b) => (ess.has(b.id) ? b : { ...b, limitUah: Math.min(b.limitUah, base.budgets.find((x) => x.id === b.id)?.spent ?? 0) }));
    base = budgetSummary(frozen, inCycle, now);
  }
  const daysLeft = Math.max(1, Math.ceil((to.getTime() - now.getTime()) / DAY_MS));

  return {
    ...base,
    daysLeft,
    safeToday: Math.max(0, Math.floor((base.totalLimit - base.totalSpent) / daysLeft)),
    from,
    to,
    income,
    incomeKnown: !!recentSalary,
    loans,
    savingsTarget: o.savings,
    debt,
    planned,
    essentialOnly: !!o.essentialOnly,
    ...alloc,
  };
}

/** Бюджет, у який потрапляє категорія транзакції (для сповіщення після покупки) */
export function budgetFor(summary: BudgetSummary, category: string) {
  return summary.budgets.find((b) => b.categories.includes(category)) ?? null;
}
