import { eq } from "drizzle-orm";
import { db } from "@/db";
import { syncState } from "@/db/schema";

export function getState<T>(key: string): T | null {
  const row = db.select().from(syncState).where(eq(syncState.key, key)).get();
  return row ? (JSON.parse(row.value) as T) : null;
}

export function setState(key: string, value: unknown) {
  const v = JSON.stringify(value);
  db.insert(syncState)
    .values({ key, value: v })
    .onConflictDoUpdate({ target: syncState.key, set: { value: v } })
    .run();
}
