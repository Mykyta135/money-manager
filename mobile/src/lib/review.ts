import { and, desc, gt, lt, ne } from "drizzle-orm";
import { transactions } from "@/db/schema";
import { INSTALLMENTS } from "@/lib/feed";
import { db } from "@m/db";
import { setCategory } from "./data";
import { getState, setState } from "./state";

// Щоденний огляд: нові витрати чекають «ок» або іншої категорії.
// Все, що старіше за review:from, вважається переглянутим; новіші «ок» — у списку review:ok.

const FROM = "review:from";
const OK = "review:ok";
const KEEP_OK = 1000;

function from() {
  const v = getState<number>(FROM);
  if (v !== null) return v;
  const start = Math.floor(Date.now() / 1000) - 2 * 86_400; // перший запуск — останні 2 дні
  setState(FROM, start);
  return start;
}

export function toReview(limit = 100) {
  const ok = new Set(getState<string[]>(OK) ?? []);
  return db
    .select()
    .from(transactions)
    .where(and(gt(transactions.time, from()), lt(transactions.amount, 0), ne(transactions.category, INSTALLMENTS)))
    .orderBy(desc(transactions.time))
    .limit(limit + ok.size)
    .all()
    .filter((t) => !t.isTransfer && !ok.has(t.id))
    .slice(0, limit);
}

export function approve(id: string) {
  setState(OK, [id, ...(getState<string[]>(OK) ?? [])].slice(0, KEEP_OK));
}

export function unapprove(id: string) {
  setState(OK, (getState<string[]>(OK) ?? []).filter((x) => x !== id));
}

export function recategorize(id: string, category: string) {
  setCategory(id, category);
  approve(id);
}

/** Повертає попередній стан — щоб «скасувати» відновило чергу */
export function approveAll() {
  const prev = { from: from(), ok: getState<string[]>(OK) ?? [] };
  setState(FROM, Math.floor(Date.now() / 1000));
  setState(OK, []);
  return prev;
}

export function restoreReview(prev: { from: number; ok: string[] }) {
  setState(FROM, prev.from);
  setState(OK, prev.ok);
}
