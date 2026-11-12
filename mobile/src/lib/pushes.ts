import { and, eq, like } from "drizzle-orm";
import BankPush from "../../modules/bank-push/src/BankPushModule";
import { accounts, transactions, type NewTransaction } from "@/db/schema";
import { categorize } from "@/lib/categories";
import { bankOf, parsePush, type BankPushEvent } from "@/lib/pushParse";
import { db } from "@m/db";
import { reactToNew } from "./spend";
import { getState, setState } from "./state";

// Пуші банків → операції одразу після оплати. Згодом синк моно підтягує точний запис
// і замінює «пушеву» копію (dedupeMono). Для Укрсибу й ПУМБ (без API) пуш і є записом.

export type { BankPushEvent } from "@/lib/pushParse";

function accountFor(bank: "mono" | "ukrsib" | "pumb") {
  const list = db.select().from(accounts).where(eq(accounts.bank, bank)).all();
  // Для моно — кредитна black (там проходять оплати), інакше перший рахунок банку
  const acc = list.find((a) => a.creditLimit > 0) ?? list[0];
  if (acc) return acc.id;
  const id = `${bank}:push`;
  db.insert(accounts).values({ id, bank, name: bank.toUpperCase(), currency: "UAH" }).onConflictDoNothing().run();
  return id;
}

export async function processPushes() {
  let events: BankPushEvent[] = [];
  try {
    events = JSON.parse(BankPush.drain());
  } catch {
    return 0;
  }
  if (events.length === 0) return 0;

  // Останні сирі пуші — показуються в налаштуваннях, щоб підлаштувати розбір
  setState("push:recent", [...events, ...(getState<BankPushEvent[]>("push:recent") ?? [])].slice(0, 20));

  const fresh: NewTransaction[] = [];
  for (const e of events) {
    const bank = bankOf(e.pkg);
    const parsed = bank && parsePush(e);
    if (!bank || !parsed) continue;
    const row: NewTransaction = {
      id: `push:${e.key}:${e.at}`,
      accountId: accountFor(bank),
      bank,
      time: Math.floor(e.at / 1000),
      amount: parsed.amount,
      description: parsed.merchant,
      category: categorize(null, `${parsed.merchant} ${e.text}`),
      raw: JSON.stringify(e),
    };
    const inserted = db.insert(transactions).values(row).onConflictDoNothing().run();
    // Моно баланси бере з API; для решти банків пуш — єдине джерело актуального балансу
    if (bank !== "mono" && parsed.balance !== null) {
      db.update(accounts).set({ balance: parsed.balance, debt: 0, updatedAt: Math.floor(e.at / 1000) }).where(eq(accounts.id, row.accountId)).run();
    }
    if (inserted.changes) fresh.push(row);
  }
  await reactToNew(fresh);
  return fresh.length;
}

/**
 * Синк моно приніс точні операції → прибираємо їхні «пушеві» копії (та сама сума, ±20 хв).
 * Повертає ті з real, про які вже сповіщали з пушу, — щоб не дублювати сповіщення.
 */
export function dedupeMono<T extends { amount: number; time: number }>(real: T[]): Set<T> {
  const pushes = db
    .select({ id: transactions.id, amount: transactions.amount, time: transactions.time })
    .from(transactions)
    .where(and(eq(transactions.bank, "mono"), like(transactions.id, "push:%")))
    .all();
  const announced = new Set<T>();
  for (const p of pushes) {
    const match = real.find((r) => !announced.has(r) && r.amount === p.amount && Math.abs(r.time - p.time) <= 20 * 60);
    if (!match) continue;
    announced.add(match);
    db.delete(transactions).where(eq(transactions.id, p.id)).run();
  }
  return announced;
}
