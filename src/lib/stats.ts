import { sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, loans } from "@/db/schema";
import { getState } from "@/lib/sync-state";
import { loanStats } from "@/lib/loans";

// Поки що вся аналітика — тільки по гривневих рахунках

export type MonthRow = { month: string; income: number; expense: number };

export function monthlySummary(months = 12): MonthRow[] {
  const since = Math.floor(Date.now() / 1000) - months * 31 * 86_400;
  return db.all<MonthRow>(sql`
    SELECT strftime('%Y-%m', t.time, 'unixepoch', 'localtime') AS month,
           -- позичені гроші (розстрочка на картку, кредит до завтра) — не дохід
           SUM(CASE WHEN t.amount > 0 AND t.category != 'Позики' THEN t.amount ELSE 0 END) AS income,
           SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END) AS expense
    FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE a.currency = 'UAH' AND t.is_transfer = 0 AND t.time >= ${since}
    GROUP BY month ORDER BY month
  `);
}

export type CategoryRow = { category: string; total: number; count: number };

export function expensesByCategory(fromUnix: number, toUnix = Number.MAX_SAFE_INTEGER): CategoryRow[] {
  return db.all<CategoryRow>(sql`
    SELECT t.category, SUM(-t.amount) AS total, COUNT(*) AS count
    FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE a.currency = 'UAH' AND t.is_transfer = 0 AND t.amount < 0 AND t.time >= ${fromUnix} AND t.time < ${toUnix}
    GROUP BY t.category ORDER BY total DESC
  `);
}

/** Комісії банків + операції з категорії "Комісії та відсотки" */
export function feesSince(fromUnix: number): number {
  const row = db.get<{ fees: number | null }>(sql`
    SELECT SUM(t.commission) + SUM(CASE WHEN t.category = 'Комісії та відсотки' AND t.amount < 0 THEN -t.amount ELSE 0 END) AS fees
    FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE a.currency = 'UAH' AND t.time >= ${fromUnix}
  `);
  return row?.fees ?? 0;
}

export function overview() {
  const accs = db.select().from(accounts).all();
  const loanRows = db.select().from(loans).all().map((l) => ({ loan: l, stats: loanStats(l) }));

  // Власні гроші = баланс мінус кредитний ліміт мінус овердрафт (від'ємне — ти в мінусі)
  const ownUah = accs
    .filter((a) => a.currency === "UAH")
    .reduce((s, a) => s + (a.balance ?? 0) - a.creditLimit - a.debt, 0);
  const loansRemaining = loanRows.reduce((s, l) => s + l.stats.remaining, 0);

  return {
    accounts: accs,
    loans: loanRows,
    ownUah,
    loansRemaining,
    netWorth: ownUah - loansRemaining,
    lastMonoSync: getState<number>("mono:lastSyncAt"),
  };
}
