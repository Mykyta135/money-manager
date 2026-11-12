// Структура таблиць — точна копія бази на Mac (src/db/schema.ts → data/money.db).
// Нова версія схеми = новий елемент у MIGRATIONS (індекс + 1 = PRAGMA user_version).

export const MIGRATIONS: string[][] = [
  [
    `CREATE TABLE IF NOT EXISTS accounts (
      id text PRIMARY KEY NOT NULL, bank text NOT NULL, name text NOT NULL, type text,
      currency text DEFAULT 'UAH' NOT NULL, iban text, balance integer,
      credit_limit integer DEFAULT 0 NOT NULL, updated_at integer,
      debt integer DEFAULT 0 NOT NULL, card_masks text)`,
    `CREATE TABLE IF NOT EXISTS budgets (
      id text PRIMARY KEY NOT NULL, name text NOT NULL, categories text NOT NULL,
      limit_uah integer NOT NULL, sort integer DEFAULT 0 NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS loans (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL, bank text NOT NULL, name text NOT NULL,
      principal integer NOT NULL, monthly_payment integer NOT NULL, term_months integer NOT NULL,
      start_date text NOT NULL, one_time_fee integer DEFAULT 0 NOT NULL, notes text)`,
    `CREATE TABLE IF NOT EXISTS offers (
      id text PRIMARY KEY NOT NULL, source text NOT NULL, kind text NOT NULL, title text NOT NULL,
      rate_pct real, credit_rate_pct real, fixed_uah integer, min_purchase_uah integer, match text,
      valid_until text, activated integer DEFAULT false NOT NULL, notes text)`,
    `CREATE TABLE IF NOT EXISTS rewards (
      id text PRIMARY KEY NOT NULL, program text NOT NULL, kind text NOT NULL, balance real NOT NULL,
      unit text NOT NULL, value_uah integer, expires_at text, how_to_use text, updated_at text NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS sync_state (key text PRIMARY KEY NOT NULL, value text NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id text PRIMARY KEY NOT NULL, account_id text NOT NULL, bank text NOT NULL, time integer NOT NULL,
      amount integer NOT NULL, operation_amount integer, operation_currency text,
      description text DEFAULT '' NOT NULL, comment text, mcc integer,
      category text DEFAULT 'Інше' NOT NULL, commission integer DEFAULT 0 NOT NULL,
      cashback integer DEFAULT 0 NOT NULL, balance_after integer, counter_name text, counter_iban text,
      is_transfer integer DEFAULT false NOT NULL, hold integer DEFAULT false NOT NULL, raw text,
      category_locked integer DEFAULT false NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS tx_time ON transactions (time)`,
  ],
  // v2: журнал сповіщень — щоб прочитати навіть після очищення шторки
  [
    `CREATE TABLE IF NOT EXISTS inbox (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL, at integer NOT NULL, channel text NOT NULL,
      title text NOT NULL, body text NOT NULL, read integer DEFAULT 0 NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS inbox_at ON inbox (at)`,
  ],
  // v3: товари з чеків і список покупок
  [
    `CREATE TABLE IF NOT EXISTS receipt_items (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL, tx_id text, store text NOT NULL, at integer NOT NULL,
      name text NOT NULL, item_key text NOT NULL, item_group text NOT NULL,
      qty real NOT NULL, unit_price integer NOT NULL, total integer NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS receipt_items_key ON receipt_items (item_key)`,
    `CREATE TABLE IF NOT EXISTS shopping (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL, name text NOT NULL, done integer DEFAULT 0 NOT NULL, created_at integer NOT NULL)`,
  ],
  // v4: рахунок можна архівувати (напр. Укрсиб без API) — лишається для історії, але не в бюджеті/"власних"
  [`ALTER TABLE accounts ADD COLUMN archived integer DEFAULT 0 NOT NULL`],
];
