import { eq } from "drizzle-orm";
import { syncState } from "@/db/schema";
import { db } from "@m/db";

// Той самий key/value, що й на Mac (sync_state), — тож стан синку переноситься при імпорті

export function getState<T>(key: string): T | null {
  const row = db.select().from(syncState).where(eq(syncState.key, key)).get();
  return row ? (JSON.parse(row.value) as T) : null;
}

export function setState(key: string, value: unknown) {
  const v = JSON.stringify(value);
  db.insert(syncState).values({ key, value: v }).onConflictDoUpdate({ target: syncState.key, set: { value: v } }).run();
}

/** Виконати раз на період: once("weekly-2026-45", ...) */
export function once(key: string, fn: () => unknown) {
  if (getState<boolean>(`once:${key}`)) return;
  setState(`once:${key}`, true);
  return fn();
}
