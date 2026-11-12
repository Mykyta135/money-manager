import { sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, budgets, loans, offers, rewards, syncState, transactions } from "@/db/schema";
import { markOwnTransfers } from "@/lib/transfers";

// Знімок бази для телефона (version 1) і прийом бекапу з телефона — спільне для
// /api/export, `npm run import:phone` і `npm run phone:push|pull`.

export function buildSnapshot() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    accounts: db.select().from(accounts).all(),
    transactions: db.select().from(transactions).all(),
    loans: db.select().from(loans).all(),
    budgets: db.select().from(budgets).all(),
    rewards: db.select().from(rewards).all(),
    offers: db.select().from(offers).all(),
    syncState: db.select().from(syncState).all(),
  };
}

type Snapshot = ReturnType<typeof buildSnapshot>;

/** Телефон — головна база: розстрочки й бюджети замінюються, операції й рахунки оновлюються/додаються */
export function importPhoneSnapshot(snap: Snapshot) {
  if (snap.version !== 1) throw new Error(`Невідома версія бекапу: ${snap.version}`);
  const count = () => db.select({ n: sql<number>`count(*)` }).from(transactions).get()!.n;
  const before = count();

  db.transaction((tx) => {
    for (const a of snap.accounts) tx.insert(accounts).values(a).onConflictDoUpdate({ target: accounts.id, set: a }).run();
    for (const t of snap.transactions) {
      // raw на Mac лишаємо (на телефоні його нема) — з нього рахуються перекази між своїми
      tx.insert(transactions)
        .values(t)
        .onConflictDoUpdate({
          target: transactions.id,
          set: {
            amount: t.amount,
            description: t.description,
            category: t.category,
            categoryLocked: t.categoryLocked,
            isTransfer: t.isTransfer,
            hold: t.hold,
            balanceAfter: t.balanceAfter,
            cashback: t.cashback,
            commission: t.commission,
          },
        })
        .run();
    }
    tx.delete(loans).run();
    for (const l of snap.loans) tx.insert(loans).values(l).run();
    tx.delete(budgets).run();
    for (const b of snap.budgets) tx.insert(budgets).values(b).run();
    for (const r of snap.rewards) tx.insert(rewards).values(r).onConflictDoUpdate({ target: rewards.id, set: r }).run();
    for (const o of snap.offers) tx.insert(offers).values(o).onConflictDoUpdate({ target: offers.id, set: o }).run();
    for (const s of snap.syncState.filter((s) => s.key.startsWith("mono:"))) {
      tx.insert(syncState).values(s).onConflictDoUpdate({ target: syncState.key, set: { value: s.value } }).run();
    }
  });

  return { added: count() - before, loans: snap.loans.length, budgets: snap.budgets.length, transfers: markOwnTransfers() };
}
