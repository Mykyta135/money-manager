import * as SecureStore from "expo-secure-store";
import { inArray, sql } from "drizzle-orm";
import { accounts, transactions, type NewTransaction } from "@/db/schema";
import { categorize, currencyFromCode } from "@/lib/categories";
import { MonoClient, type MonoStatementItem } from "@/lib/mono/client";
import { db } from "@m/db";
import { dedupeMono } from "./pushes";
import { reactToNew } from "./spend";
import { getState, setState } from "./state";

// Синк моно з телефона. Ліміт API — 1 запит/хв, а фонова задача стартує раз на 15+ хв,
// тому за один запуск робимо рівно ОДИН запит: по черзі рахунки, раз на годину — client-info.

export const TOKEN_KEY = "mono_token";
const MIN_GAP_S = 61;
const OVERLAP_S = 3 * 86_400;
const CLIENT_INFO_EVERY_S = 3600;

type Range = { from: number; to: number };

export async function syncStep(): Promise<string> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!token) return "нема токена моно";

  const now = Math.floor(Date.now() / 1000);
  const last = getState<number>("mono:lastCallAt") ?? 0;
  if (now - last < MIN_GAP_S) return `зачекай ${MIN_GAP_S - (now - last)} с (ліміт моно)`;
  setState("mono:lastCallAt", now);

  const client = new MonoClient(token);
  const accIds = db.select({ id: accounts.id }).from(accounts).all().filter((a) => a.id.startsWith("mono:"));

  if (accIds.length === 0 || now - (getState<number>("mono:clientInfoAt") ?? 0) > CLIENT_INFO_EVERY_S) {
    const info = await client.clientInfo();
    setState("mono:clientInfoAt", now);
    setState("mono:ownerName", info.name);
    setState("mono:jars", info.jars ?? []);
    for (const a of info.accounts) {
      const currency = currencyFromCode(a.currencyCode);
      const row = {
        id: `mono:${a.id}`,
        bank: "mono" as const,
        name: `Моно ${a.type} ${currency}${a.maskedPan[0] ? ` ${a.maskedPan[0].slice(-4)}` : ""}`,
        type: a.type,
        currency,
        iban: a.iban,
        balance: a.balance,
        creditLimit: a.creditLimit,
        cardMasks: a.maskedPan,
        updatedAt: now,
      };
      db.insert(accounts).values(row).onConflictDoUpdate({ target: accounts.id, set: row }).run();
    }
    return `оновлено баланси (${info.accounts.length} рах.)`;
  }

  // Рахунки по колу: який синкали найдавніше — той і зараз
  const ranges = accIds.map((a) => ({ id: a.id, range: getState<Range>(`mono:range:${a.id.slice(5)}`) }));
  const next = ranges.sort((a, b) => (a.range?.to ?? 0) - (b.range?.to ?? 0))[0];
  const accountId = next.id.slice(5);
  const from = Math.max((next.range?.to ?? now - 31 * 86_400) - OVERLAP_S, now - 31 * 86_400 + 60);

  const items = await client.statement(accountId, from, now);
  const fresh = save(next.id, items);
  setState(`mono:range:${accountId}`, { from: next.range?.from ?? from, to: now });

  // Баланс рахунку = баланс після найновішої операції
  const newest = items.reduce<MonoStatementItem | null>((m, i) => (!m || i.time > m.time ? i : m), null);
  if (newest) db.update(accounts).set({ balance: newest.balance, updatedAt: now }).where(sql`${accounts.id} = ${next.id}`).run();

  const announced = dedupeMono(fresh);
  await reactToNew(fresh.filter((t) => !announced.has(t)));
  return `${next.id}: ${items.length} операцій, нових ${fresh.length}`;
}

function save(accountId: string, items: MonoStatementItem[]) {
  if (items.length === 0) return [];
  const ids = items.map((i) => `mono:${i.id}`);
  const existing = new Set(
    db.select({ id: transactions.id }).from(transactions).where(inArray(transactions.id, ids)).all().map((r) => r.id),
  );
  const owner = (getState<string>("mono:ownerName") ?? "").toLowerCase();

  const rows: NewTransaction[] = items.map((i) => ({
    id: `mono:${i.id}`,
    accountId,
    bank: "mono",
    time: i.time,
    amount: i.amount,
    operationAmount: i.operationAmount,
    operationCurrency: currencyFromCode(i.currencyCode),
    description: i.description,
    comment: i.comment ?? null,
    mcc: i.mcc,
    category: categorize(i.mcc, i.description),
    commission: i.commissionRate,
    cashback: i.cashbackAmount,
    balanceAfter: i.balance,
    counterName: i.counterName ?? null,
    counterIban: i.counterIban ?? null,
    isTransfer:
      /^(на|з) банк[уи]/i.test(i.description) || (!!owner && (i.counterName ?? "").toLowerCase() === owner),
    hold: i.hold,
  }));

  db.transaction((tx) => {
    for (const row of rows) {
      tx.insert(transactions)
        .values(row)
        .onConflictDoUpdate({
          target: transactions.id,
          set: {
            amount: sql`excluded.amount`,
            description: sql`excluded.description`,
            commission: sql`excluded.commission`,
            cashback: sql`excluded.cashback`,
            balanceAfter: sql`excluded.balance_after`,
            hold: sql`excluded.hold`,
          },
        })
        .run();
    }
  });
  return rows.filter((r) => !existing.has(r.id!));
}
