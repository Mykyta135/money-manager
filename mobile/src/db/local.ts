import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Таблиці, які є тільки на телефоні (на Mac їх нема)

export const inbox = sqliteTable("inbox", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  at: integer("at").notNull(), // unix ms
  channel: text("channel").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
});

export type InboxItem = typeof inbox.$inferSelect;

export const receiptItems = sqliteTable("receipt_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  txId: text("tx_id"),
  store: text("store").notNull(),
  at: integer("at").notNull(), // unix s
  name: text("name").notNull(),
  itemKey: text("item_key").notNull(),
  itemGroup: text("item_group").notNull(),
  qty: real("qty").notNull(),
  unitPrice: integer("unit_price").notNull(), // копійки
  total: integer("total").notNull(),
});

export const shopping = sqliteTable("shopping", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
});

export type ReceiptItem = typeof receiptItems.$inferSelect;
export type ShoppingItem = typeof shopping.$inferSelect;
