import { accounts, budgets, loans, offers, rewards, syncState, transactions } from "@/db/schema";
import { db } from "@m/db";

// Одноразовий перенос бази з Mac: `npm run dev:lan` на Mac → GET /api/export з токеном

type Snapshot = {
  version: number;
  accounts: (typeof accounts.$inferInsert)[];
  transactions: (typeof transactions.$inferInsert)[];
  loans: (typeof loans.$inferInsert)[];
  budgets: (typeof budgets.$inferInsert)[];
  rewards: (typeof rewards.$inferInsert)[];
  offers: (typeof offers.$inferInsert)[];
  syncState: (typeof syncState.$inferInsert)[];
};

export async function importFromMac(baseUrl: string, token: string) {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/export`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Mac відповів ${res.status}`);
  return loadSnapshot((await res.json()) as Snapshot);
}

/** money://sync — повна адреса з одноразовим токеном від `npm run phone:push` */
export async function importFromUrl(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mac відповів ${res.status}`);
  return loadSnapshot((await res.json()) as Snapshot);
}

/**
 * Злиття з Mac: операції й рахунки оновлюються/додаються (свої ручні й «пушеві» операції
 * телефона не зникають), розстрочки й бюджети — як на Mac.
 */
function loadSnapshot(snap: Snapshot) {
  if (snap.version !== 1) throw new Error(`Невідома версія експорту: ${snap.version}`);
  db.transaction((tx) => {
    for (const r of snap.accounts) tx.insert(accounts).values(r).onConflictDoUpdate({ target: accounts.id, set: r }).run();
    for (const r of snap.transactions) {
      const row = { ...r, raw: null };
      tx.insert(transactions).values(row).onConflictDoUpdate({ target: transactions.id, set: row }).run();
    }
    tx.delete(loans).run();
    for (const r of snap.loans) tx.insert(loans).values(r).run();
    tx.delete(budgets).run();
    for (const r of snap.budgets) tx.insert(budgets).values(r).run();
    for (const r of snap.rewards) tx.insert(rewards).values(r).onConflictDoUpdate({ target: rewards.id, set: r }).run();
    for (const r of snap.offers) tx.insert(offers).values(r).onConflictDoUpdate({ target: offers.id, set: r }).run();
    for (const r of snap.syncState.filter((s) => s.key.startsWith("mono:range:") || s.key === "mono:ownerName")) {
      tx.insert(syncState).values(r).onConflictDoUpdate({ target: syncState.key, set: { value: r.value } }).run();
    }
  });
  return { transactions: snap.transactions.length, loans: snap.loans.length, budgets: snap.budgets.length };
}
