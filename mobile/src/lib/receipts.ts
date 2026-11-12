import { and, desc, eq, gte, lt, ne } from "drizzle-orm";
import { transactions } from "@/db/schema";
import { formatMoney } from "@/lib/format";
import { itemGroup, itemKey, type ParsedItem } from "@/lib/items";
import { db } from "@m/db";
import { receiptItems, shopping } from "@m/db/local";
import { notify } from "./notify";

// Чеки → товари; «чи не дорого?» по історії цін; список покупок з оцінкою суми

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** Операція, до якої найімовірніше належить чек: та сама сума (±1 ₴) за 2 дні, інакше найсвіжіша витрата */
export function guessTransaction(total: number) {
  const since = Math.floor(Date.now() / 1000) - 2 * 86_400;
  const recent = db.select().from(transactions).where(and(gte(transactions.time, since), lt(transactions.amount, 0))).orderBy(desc(transactions.time)).all();
  return recent.find((t) => Math.abs(-t.amount - total) <= 100) ?? recent[0] ?? null;
}

/** Попередні покупки того ж товару в тому ж магазині (без поточного чека) */
function lastPrice(key: string, store: string, beforeAt: number) {
  return db
    .select({ unitPrice: receiptItems.unitPrice, at: receiptItems.at })
    .from(receiptItems)
    .where(and(eq(receiptItems.itemKey, key), eq(receiptItems.store, store), lt(receiptItems.at, beforeAt)))
    .orderBy(desc(receiptItems.at))
    .limit(1)
    .get();
}

/** Найдешевший схожий товар тієї ж групи, який ти вже брав у цьому магазині (напр. звичайне філе замість «Епікур») */
function cheaperAlternative(key: string, group: string, store: string, unitPrice: number) {
  const firstWord = key.split(" ")[0];
  if (!firstWord || firstWord.length < 3) return null;
  return db
    .select({ name: receiptItems.name, unitPrice: receiptItems.unitPrice })
    .from(receiptItems)
    .where(and(eq(receiptItems.itemGroup, group), eq(receiptItems.store, store), ne(receiptItems.itemKey, key)))
    .all()
    .filter((r) => r.name.toLowerCase().includes(firstWord) && r.unitPrice < unitPrice * 0.9)
    .sort((a, b) => a.unitPrice - b.unitPrice)[0] ?? null;
}

export async function saveReceipt(store: string, txId: string | null, items: ParsedItem[], at = Math.floor(Date.now() / 1000)) {
  const warnings: string[] = [];
  const byGroup = new Map<string, number>();

  for (const i of items) {
    const key = itemKey(i.name);
    const group = itemGroup(i.name);
    const prev = lastPrice(key, store, at);
    if (prev && i.unitPrice > prev.unitPrice * 1.05) {
      warnings.push(`${i.name}: ${formatMoney(prev.unitPrice)} → ${formatMoney(i.unitPrice)} (+${Math.round((i.unitPrice / prev.unitPrice - 1) * 100)}%)`);
    }
    const alt = cheaperAlternative(key, group, store, i.unitPrice);
    if (alt) warnings.push(`${i.name}: брав «${alt.name}» по ${formatMoney(alt.unitPrice)} — дешевше на ${Math.round((1 - alt.unitPrice / i.unitPrice) * 100)}%`);

    db.insert(receiptItems).values({ txId, store, at, name: i.name, itemKey: key, itemGroup: group, qty: i.qty, unitPrice: i.unitPrice, total: i.total }).run();
    byGroup.set(group, (byGroup.get(group) ?? 0) + i.total);
  }

  const top = [...byGroup].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g, s]) => `${g} ${formatMoney(s)}`);
  await notify("spend", `Чек: ${items.length} товарів`, [top.join(" · "), ...(warnings.length ? ["Чи не дорого:", ...warnings.slice(0, 3)] : [])].join("\n"));
  return warnings;
}

export function itemsFor(txId: string) {
  return db.select().from(receiptItems).where(eq(receiptItems.txId, txId)).all();
}

/** «Що саме купую» за період: суми по групах товарів */
export function groupsSince(fromSec: number) {
  const rows = db.select().from(receiptItems).where(gte(receiptItems.at, fromSec)).all();
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.itemGroup, (m.get(r.itemGroup) ?? 0) + r.total);
  return [...m].map(([group, total]) => ({ group, total })).sort((a, b) => b.total - a.total);
}

// ---- Список покупок ----

/** Оцінка ціни за твоїми ж чеками: медіана останніх покупок товару з таким словом */
export function estimatePrice(name: string) {
  const key = itemKey(name);
  const word = key.split(" ").find((w) => w.length >= 3);
  if (!word) return null;
  const prices = db
    .select({ total: receiptItems.total, name: receiptItems.itemKey })
    .from(receiptItems)
    .orderBy(desc(receiptItems.at))
    .limit(500)
    .all()
    .filter((r) => r.name.includes(word))
    .slice(0, 5)
    .map((r) => r.total);
  return prices.length ? median(prices) : null;
}

export function shoppingList() {
  return db.select().from(shopping).orderBy(shopping.done, desc(shopping.createdAt)).all().map((i) => ({ ...i, estimate: estimatePrice(i.name) }));
}

export function addShopping(name: string) {
  db.insert(shopping).values({ name, createdAt: Date.now() }).run();
}

export function toggleShopping(id: number, done: boolean) {
  db.update(shopping).set({ done }).where(eq(shopping.id, id)).run();
}

export function clearBought() {
  db.delete(shopping).where(eq(shopping.done, true)).run();
}
