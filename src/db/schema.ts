import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// Усі суми — цілі числа в копійках (мінорних одиницях валюти).
// Час транзакцій — unix seconds.

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(), // "mono:<id>", "ukrsib:<iban>", ...
  bank: text("bank", { enum: ["mono", "ukrsib", "pumb", "cash"] }).notNull(),
  name: text("name").notNull(),
  type: text("type"),
  currency: text("currency").notNull().default("UAH"),
  iban: text("iban"),
  balance: integer("balance"), // для моно: разом з кредитним лімітом
  creditLimit: integer("credit_limit").notNull().default(0),
  debt: integer("debt").notNull().default(0), // напр. несанкціонований овердрафт в Укрсибі
  cardMasks: text("card_masks", { mode: "json" }).$type<string[]>(), // "555555****0000" — для пошуку переказів між своїми
  updatedAt: integer("updated_at"),
  // Рахунок закритий/не ведеться (напр. Укрсиб без API) — лишається для історії, але не в бюджеті/"власних"
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
});

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(), // "mono:<txId>" або "<bank>:<hash>" для імпорту
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  bank: text("bank", { enum: ["mono", "ukrsib", "pumb", "cash"] }).notNull(),
  time: integer("time").notNull(),
  amount: integer("amount").notNull(), // у валюті рахунку, витрати < 0
  operationAmount: integer("operation_amount"),
  operationCurrency: text("operation_currency"),
  description: text("description").notNull().default(""),
  comment: text("comment"),
  mcc: integer("mcc"),
  category: text("category").notNull().default("Інше"),
  // Категорію виставлено вручну — recategorize її не чіпає
  categoryLocked: integer("category_locked", { mode: "boolean" }).notNull().default(false),
  commission: integer("commission").notNull().default(0),
  cashback: integer("cashback").notNull().default(0),
  balanceAfter: integer("balance_after"),
  counterName: text("counter_name"),
  counterIban: text("counter_iban"),
  // Переказ між власними рахунками — не рахується ні в дохід, ні у витрати
  isTransfer: integer("is_transfer", { mode: "boolean" }).notNull().default(false),
  hold: integer("hold", { mode: "boolean" }).notNull().default(false),
  raw: text("raw"),
});

export const loans = sqliteTable("loans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bank: text("bank", { enum: ["mono", "ukrsib", "pumb", "cash"] }).notNull(),
  name: text("name").notNull(),
  principal: integer("principal").notNull(), // скільки фактично отримав / вартість товару
  monthlyPayment: integer("monthly_payment").notNull(), // разом з комісіями
  termMonths: integer("term_months").notNull(),
  startDate: text("start_date").notNull(), // YYYY-MM-DD, дата першого платежу
  oneTimeFee: integer("one_time_fee").notNull().default(0),
  notes: text("notes"),
});

export const syncState = sqliteTable("sync_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// Гаманець бонусів: кешбек, бали, кредити в акаунтах перевізників тощо
export const rewards = sqliteTable("rewards", {
  id: text("id").primaryKey(), // "mono-cashback", "uz-obiimashky", ...
  program: text("program").notNull(),
  kind: text("kind", { enum: ["cashback", "points", "credit", "voucher"] }).notNull(),
  balance: real("balance").notNull(), // у власних одиницях програми
  unit: text("unit").notNull(), // "UAH", "EUR", "балів"
  valueUah: integer("value_uah"), // оцінка в копійках; null — невідомо
  expiresAt: text("expires_at"), // YYYY-MM-DD
  howToUse: text("how_to_use"),
  updatedAt: text("updated_at").notNull(), // YYYY-MM-DD
});

// Акції, категорії кешбеку, купони — з датами, щоб нічого не згорало
export const offers = sqliteTable("offers", {
  id: text("id").primaryKey(),
  source: text("source").notNull(), // "mono", "ukrsib", "uz", "silpo", ...
  kind: text("kind", { enum: ["category", "partner", "coupon", "promo"] }).notNull(),
  title: text("title").notNull(),
  ratePct: real("rate_pct"), // % кешбеку/знижки з власних коштів
  creditRatePct: real("credit_rate_pct"), // % з кредитних коштів, якщо відрізняється
  fixedUah: integer("fixed_uah"), // фіксована знижка/бонус у копійках
  minPurchaseUah: integer("min_purchase_uah"),
  // regex по опису транзакції — щоб оцінити, скільки ти там реально витрачаєш
  match: text("match"),
  validUntil: text("valid_until"), // YYYY-MM-DD
  activated: integer("activated", { mode: "boolean" }).notNull().default(false),
  notes: text("notes"),
});

// Місячні ліміти: один бюджет може охоплювати кілька категорій ("Кафе та бари")
export const budgets = sqliteTable("budgets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  categories: text("categories", { mode: "json" }).$type<string[]>().notNull(),
  limitUah: integer("limit_uah").notNull(), // копійки на місяць
  sort: integer("sort").notNull().default(0),
});

export type Account = typeof accounts.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Loan = typeof loans.$inferSelect;
export type Reward = typeof rewards.$inferSelect;
export type Offer = typeof offers.$inferSelect;
