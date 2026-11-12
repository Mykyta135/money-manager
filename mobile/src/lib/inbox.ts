import { count, desc, eq } from "drizzle-orm";
import { db } from "@m/db";
import { inbox } from "@m/db/local";

const KEEP = 500; // старіші прочитані підчищаємо, щоб журнал не ріс безкінечно

export function logNotification(channel: string, title: string, body: string) {
  db.insert(inbox).values({ at: Date.now(), channel, title, body }).run();
}

export function inboxItems() {
  return db.select().from(inbox).orderBy(desc(inbox.at)).limit(KEEP).all();
}

export function unreadCount() {
  return db.select({ n: count() }).from(inbox).where(eq(inbox.read, false)).get()?.n ?? 0;
}

export function markRead(id: number) {
  db.update(inbox).set({ read: true }).where(eq(inbox.id, id)).run();
}

export function markAllRead() {
  db.update(inbox).set({ read: true }).where(eq(inbox.read, false)).run();
}

export function clearRead() {
  db.delete(inbox).where(eq(inbox.read, true)).run();
}
