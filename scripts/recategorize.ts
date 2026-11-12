// Перераховує категорії всіх транзакцій після зміни правил у src/lib/categories.ts:
// npm run recategorize
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { categorize } from "@/lib/categories";
import { markOwnTransfers } from "@/lib/transfers";

const rows = db
  .select({ id: transactions.id, mcc: transactions.mcc, description: transactions.description, category: transactions.category })
  .from(transactions)
  .where(eq(transactions.categoryLocked, false))
  .all();

let changed = 0;
db.transaction((tx) => {
  for (const r of rows) {
    const category = categorize(r.mcc, r.description);
    if (category === r.category) continue;
    tx.update(transactions).set({ category }).where(eq(transactions.id, r.id)).run();
    changed++;
  }
});

console.log(`категорій змінено: ${changed} з ${rows.length}`);
console.log(`переказів між своїми рахунками: ${markOwnTransfers()}`);
