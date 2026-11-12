// MCP-сервер "money" для Claude Code: аналітика по локальній базі (моно + Укрсиб + кредити).
// Підключено в .mcp.json. Stdout зайнятий протоколом — логи тільки в stderr.
import "./mcp-env";
import Database from "better-sqlite3";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { and, desc, eq, gte, inArray, like, lt, lte, or, type SQL } from "drizzle-orm";
import { db, DB_PATH } from "@/db";
import { loans, offers, rewards, transactions } from "@/db/schema";
import { paymentSchedule } from "@/lib/loans";
import { expiringSoon, monoCategoryPlan, offerEstimates, wallet, type OfferEstimate } from "@/lib/rewards";
import { expensesByCategory, feesSince, monthlySummary, overview } from "@/lib/stats";
import { syncMono } from "@/lib/mono/sync";

const BANKS = ["mono", "ukrsib", "pumb"] as const;
const uah = (minor: number | null | undefined) => (minor ?? 0) / 100;
const dateToUnix = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return Math.floor(new Date(y, m - 1, day).getTime() / 1000);
};
const unixToDate = (t: number) => new Date(t * 1000).toLocaleDateString("sv-SE"); // YYYY-MM-DD
const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

const server = new McpServer({ name: "money", version: "0.1.0" });

server.registerTool(
  "overview",
  {
    description:
      "Загальна картина: рахунки з балансами й овердрафтами, власні гроші, чисті активи, кредити з переплатою і реальною ставкою, комісії за рік, середній залишок за місяць. Суми в гривнях.",
    annotations: { readOnlyHint: true },
  },
  async () => {
    const o = overview();
    const months = monthlySummary(4);
    const thisMonth = new Date().toLocaleDateString("sv-SE").slice(0, 7);
    const full = months.filter((m) => m.month < thisMonth).slice(-3);
    return json({
      ownMoneyUah: uah(o.ownUah),
      netWorthUah: uah(o.netWorth),
      loansRemainingUah: uah(o.loansRemaining),
      avgMonthlyLeftoverUah: full.length ? uah(full.reduce((s, m) => s + m.income - m.expense, 0) / full.length) : null,
      feesLast12MonthsUah: uah(feesSince(Math.floor(Date.now() / 1000) - 365 * 86_400)),
      lastMonoSync: o.lastMonoSync ? unixToDate(o.lastMonoSync) : null,
      accounts: o.accounts.map((a) => ({
        id: a.id,
        name: a.name,
        currency: a.currency,
        ownFunds: uah((a.balance ?? 0) - a.creditLimit),
        creditLimit: uah(a.creditLimit),
        unauthorizedDebt: uah(a.debt),
      })),
      loans: o.loans.map(({ loan, stats }) => ({
        name: loan.name,
        bank: loan.bank,
        principal: uah(loan.principal),
        monthlyPayment: uah(loan.monthlyPayment),
        termMonths: loan.termMonths,
        startDate: loan.startDate,
        monthsPaid: stats.monthsPaid,
        remaining: uah(stats.remaining),
        overpaymentTotal: uah(stats.overpayment),
        overpaidSoFar: uah(stats.overpaidSoFar),
        effectiveAnnualRatePct: +(stats.effectiveAnnualRate * 100).toFixed(1),
        notes: loan.notes,
      })),
    });
  },
);

server.registerTool(
  "loan_schedule",
  {
    description: "Скільки треба платити по всіх кредитах і розстрочках у кожному з наступних місяців і які закінчуються. Суми в гривнях.",
    inputSchema: { months: z.number().int().min(1).max(60).default(24) },
    annotations: { readOnlyHint: true },
  },
  async ({ months }) =>
    json(
      paymentSchedule(db.select().from(loans).all(), months)
        .filter((m) => m.total > 0)
        .map((m) => ({ ...m, total: uah(m.total) })),
    ),
);

server.registerTool(
  "monthly_summary",
  {
    description: "Дохід, витрати і залишок по місяцях (гривневі рахунки, без переказів між своїми рахунками).",
    inputSchema: { months: z.number().int().min(1).max(60).default(12) },
    annotations: { readOnlyHint: true },
  },
  async ({ months }) =>
    json(monthlySummary(months).map((m) => ({ month: m.month, income: uah(m.income), expense: uah(m.expense), net: uah(m.income - m.expense) }))),
);

server.registerTool(
  "spending_by_category",
  {
    description: "Витрати по категоріях за період. Дати включно, YYYY-MM-DD. Без дат — останні 30 днів.",
    inputSchema: { from: isoDate.optional(), to: isoDate.optional() },
    annotations: { readOnlyHint: true },
  },
  async ({ from, to }) => {
    const fromUnix = from ? dateToUnix(from) : Math.floor(Date.now() / 1000) - 30 * 86_400;
    const toUnix = to ? dateToUnix(to) + 86_400 : undefined;
    return json(expensesByCategory(fromUnix, toUnix).map((c) => ({ ...c, total: uah(c.total) })));
  },
);

server.registerTool(
  "search_transactions",
  {
    description:
      "Пошук транзакцій. query шукає в описі, коментарі й контрагенті. Суми в гривнях: витрати від'ємні. За замовчуванням без переказів між своїми рахунками.",
    inputSchema: {
      query: z.string().optional(),
      bank: z.enum(BANKS).optional(),
      category: z.string().optional(),
      from: isoDate.optional(),
      to: isoDate.optional(),
      minAmount: z.number().optional().describe("гривні, напр. -1000 = витрати від 1000 і більше разом з min/max"),
      maxAmount: z.number().optional(),
      includeTransfers: z.boolean().default(false),
      limit: z.number().int().min(1).max(500).default(50),
    },
    annotations: { readOnlyHint: true },
  },
  async (a) => {
    const where: (SQL | undefined)[] = [];
    if (a.query) {
      const q = `%${a.query}%`;
      where.push(or(like(transactions.description, q), like(transactions.comment, q), like(transactions.counterName, q)));
    }
    if (a.bank) where.push(eq(transactions.bank, a.bank));
    if (a.category) where.push(eq(transactions.category, a.category));
    if (a.from) where.push(gte(transactions.time, dateToUnix(a.from)));
    if (a.to) where.push(lt(transactions.time, dateToUnix(a.to) + 86_400));
    if (a.minAmount !== undefined) where.push(gte(transactions.amount, Math.round(a.minAmount * 100)));
    if (a.maxAmount !== undefined) where.push(lte(transactions.amount, Math.round(a.maxAmount * 100)));
    if (!a.includeTransfers) where.push(eq(transactions.isTransfer, false));

    const rows = db
      .select()
      .from(transactions)
      .where(and(...where))
      .orderBy(desc(transactions.time))
      .limit(a.limit)
      .all();
    return json(
      rows.map((t) => ({
        id: t.id,
        date: unixToDate(t.time),
        bank: t.bank,
        amount: uah(t.amount),
        description: t.description,
        comment: t.comment,
        counterName: t.counterName,
        category: t.category,
        commission: uah(t.commission),
        isTransfer: t.isTransfer,
      })),
    );
  },
);

server.registerTool(
  "set_category",
  {
    description: "Вручну змінити категорію транзакцій (за id з search_transactions). Ручна категорія не перезаписується при recategorize.",
    inputSchema: { ids: z.array(z.string()).min(1).max(500), category: z.string().min(1) },
  },
  async ({ ids, category }) => {
    const r = db.update(transactions).set({ category, categoryLocked: true }).where(inArray(transactions.id, ids)).run();
    return json({ updated: r.changes });
  },
);

server.registerTool(
  "mark_transfer",
  {
    description: "Позначити (або зняти позначку) транзакції як переказ між власними рахунками — тоді вони не рахуються ні в дохід, ні у витрати.",
    inputSchema: { ids: z.array(z.string()).min(1).max(500), isTransfer: z.boolean().default(true) },
  },
  async ({ ids, isTransfer }) => {
    const r = db.update(transactions).set({ isTransfer }).where(inArray(transactions.id, ids)).run();
    return json({ updated: r.changes });
  },
);

// Окреме read-only з'єднання: навіть якщо модель напише UPDATE, SQLite його не виконає
const ro = new Database(DB_PATH, { readonly: true, fileMustExist: true });

server.registerTool(
  "query_sql",
  {
    description:
      "Довільний SELECT по SQLite (read-only). Таблиці: accounts(id, bank, name, currency, balance, credit_limit, debt), " +
      "transactions(id, account_id, bank, time unix, amount, operation_amount, operation_currency, description, comment, mcc, category, commission, cashback, counter_name, is_transfer, hold), " +
      "loans(bank, name, principal, monthly_payment, term_months, start_date, one_time_fee). " +
      "Усі суми в КОПІЙКАХ, витрати від'ємні. Дата: strftime('%Y-%m-%d', time, 'unixepoch', 'localtime'). Максимум 500 рядків.",
    inputSchema: { sql: z.string() },
    annotations: { readOnlyHint: true },
  },
  async ({ sql }) => {
    const stmt = ro.prepare(sql);
    if (!stmt.reader) throw new Error("Дозволені лише запити, що повертають рядки (SELECT)");
    const rows = stmt.all().slice(0, 500);
    return json(rows);
  },
);

server.registerTool(
  "bonuses_overview",
  {
    description:
      "Гаманець бонусів (кешбек, бали, кредити перевізників), рекомендовані категорії кешбеку моно, що згорає за 14 днів, і всі акції з оцінкою вигоди по реальних витратах за 90 днів. Суми в гривнях.",
    annotations: { readOnlyHint: true },
  },
  async () => {
    const w = wallet();
    const shape = (o: OfferEstimate) => ({
      id: o.id,
      source: o.source,
      kind: o.kind,
      title: o.title,
      ratePct: o.ratePct,
      creditRatePct: o.creditRatePct,
      validUntil: o.validUntil,
      activated: o.activated,
      monthlySpend: uah(o.monthlySpend),
      purchases90d: o.purchases,
      expectedOwnPerMonth: uah(o.expectedOwn),
      expectedCreditPerMonth: uah(o.expectedCredit),
      notes: o.notes,
    });
    const soon = expiringSoon(14);
    return json({
      walletTotalUah: uah(w.totalUah),
      wallet: w.list.map((r) => ({ ...r, valueUah: r.valueUah === null ? null : uah(r.valueUah) })),
      monoCategoryPicks: monoCategoryPlan(2).picks.map(shape),
      expiringSoon: { rewards: soon.rewards.map((r) => r.id), offers: soon.offers.map(shape) },
      offers: offerEstimates().filter((o) => !o.expired).map(shape),
    });
  },
);

server.registerTool(
  "reward_upsert",
  {
    description: "Додати або оновити баланс бонусної програми в гаманці (кешбек, бали, кредит у перевізника).",
    inputSchema: {
      id: z.string().describe("стабільний id, напр. 'uz-obiimashky'"),
      program: z.string(),
      kind: z.enum(["cashback", "points", "credit", "voucher"]),
      balance: z.number(),
      unit: z.string(),
      valueUah: z.number().nullable().describe("оцінка в гривнях; null якщо невідомо"),
      expiresAt: isoDate.nullable().optional(),
      howToUse: z.string().optional(),
    },
  },
  async (a) => {
    const row = {
      ...a,
      valueUah: a.valueUah === null ? null : Math.round(a.valueUah * 100),
      expiresAt: a.expiresAt ?? null,
      howToUse: a.howToUse ?? null,
      updatedAt: unixToDate(Math.floor(Date.now() / 1000)),
    };
    db.insert(rewards).values(row).onConflictDoUpdate({ target: rewards.id, set: row }).run();
    return json({ ok: true });
  },
);

server.registerTool(
  "offer_upsert",
  {
    description:
      "Додати або оновити акцію/категорію кешбеку/купон. match — regex по 'категорія опис' транзакції, щоб оцінити вигоду по реальних витратах (напр. '^Таксі ' або 'kfc').",
    inputSchema: {
      id: z.string(),
      source: z.string().describe("mono, ukrsib, privat, uz, silpo, ..."),
      kind: z.enum(["category", "partner", "coupon", "promo"]),
      title: z.string(),
      ratePct: z.number().nullable().optional(),
      creditRatePct: z.number().nullable().optional(),
      fixedUah: z.number().nullable().optional(),
      minPurchaseUah: z.number().nullable().optional(),
      match: z.string().nullable().optional(),
      validUntil: isoDate.nullable().optional(),
      activated: z.boolean().optional(),
      notes: z.string().nullable().optional(),
    },
  },
  async (a) => {
    if (a.match) new RegExp(a.match, "i"); // невалідний regex — помилка тут, а не на сторінці
    const kop = (x: number | null | undefined) => (x === null || x === undefined ? null : Math.round(x * 100));
    const row = {
      id: a.id,
      source: a.source,
      kind: a.kind,
      title: a.title,
      ratePct: a.ratePct ?? null,
      creditRatePct: a.creditRatePct ?? null,
      fixedUah: kop(a.fixedUah),
      minPurchaseUah: kop(a.minPurchaseUah),
      match: a.match ?? null,
      validUntil: a.validUntil ?? null,
      activated: a.activated ?? false,
      notes: a.notes ?? null,
    };
    db.insert(offers).values(row).onConflictDoUpdate({ target: offers.id, set: row }).run();
    return json({ ok: true });
  },
);

let monoSync: { running: boolean; log: string[]; error?: string } = { running: false, log: [] };

server.registerTool(
  "mono_sync",
  {
    description:
      "Запускає синхронізацію monobank у фоні (ліміт API — 1 запит/хв, тому це хвилини). Повторний виклик повертає статус і останні рядки логу.",
  },
  async () => {
    if (monoSync.running || monoSync.log.length) {
      const status = { running: monoSync.running, error: monoSync.error, log: monoSync.log.slice(-15) };
      if (!monoSync.running) monoSync = { running: false, log: [] };
      return json(status);
    }
    const token = process.env.MONO_TOKEN;
    if (!token) throw new Error("Немає MONO_TOKEN у .env.local");

    monoSync = { running: true, log: [] };
    syncMono({
      token,
      backfillDays: Number(process.env.MONO_BACKFILL_DAYS ?? 365),
      log: (m) => monoSync.log.push(`${new Date().toLocaleTimeString("uk-UA")} ${m}`),
    })
      .catch((e) => (monoSync.error = String(e)))
      .finally(() => (monoSync.running = false));
    return json({ started: true, hint: "виклич mono_sync ще раз, щоб побачити прогрес" });
  },
);

server.connect(new StdioServerTransport()).then(() => console.error("[money-mcp] готовий"));
