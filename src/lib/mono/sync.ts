import { sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, transactions, type NewTransaction } from "@/db/schema";
import { categorize, currencyFromCode } from "@/lib/categories";
import { getState, setState } from "@/lib/sync-state";
import { markOwnTransfers } from "@/lib/transfers";
import { MonoClient, type MonoAccount, type MonoStatementItem } from "./client";

const DAY = 86_400;
const WINDOW = 31 * DAY;
const PAGE_LIMIT = 500;
// Холди можуть змінитися після проведення — перезатягуємо останні дні
const OVERLAP = 3 * DAY;

type Range = { from: number; to: number };

let running = false;

export async function syncMono(opts: {
  token: string;
  backfillDays: number;
  log?: (msg: string) => void;
}) {
  if (running) return opts.log?.("синхронізація вже йде");
  running = true;
  const log = opts.log ?? (() => {});
  try {
    const client = new MonoClient(opts.token, log);
    const info = await client.clientInfo();
    setState("mono:ownerName", info.name);
    upsertAccounts(info.accounts);
    log(`рахунків: ${info.accounts.length}`);

    const now = Math.floor(Date.now() / 1000);
    const target = now - opts.backfillDays * DAY;

    for (const acc of info.accounts) {
      const key = `mono:range:${acc.id}`;
      const label = `${acc.type} ${currencyFromCode(acc.currencyCode)}`;
      const range = getState<Range>(key);

      if (range) {
        log(`${label}: нові транзакції`);
        await fetchRange(client, acc, info.name, Math.max(range.to - OVERLAP, range.from), now);
        range.to = now;
        setState(key, range);
      }

      // Догружаємо історію назад по 31 добі; прогрес зберігаємо після кожного вікна
      const r = range ?? { from: now, to: now };
      while (r.from > target) {
        const from = Math.max(target, r.from - WINDOW);
        log(`${label}: історія ${fmt(from)} — ${fmt(r.from)}`);
        await fetchRange(client, acc, info.name, from, r.from);
        r.from = from;
        setState(key, r);
      }
    }
    setState("mono:lastSyncAt", now);
    log(`переказів між своїми рахунками знайдено: ${markOwnTransfers()}`);
    log("готово");
  } finally {
    running = false;
  }
}

async function fetchRange(
  client: MonoClient,
  acc: MonoAccount,
  ownerName: string,
  from: number,
  to: number,
) {
  // Вікна не довші за 31 добу, від новіших до старіших
  for (let end = to; end > from; end -= WINDOW) {
    const start = Math.max(from, end - WINDOW);
    let pageEnd = end;
    for (;;) {
      const items = await client.statement(acc.id, start, pageEnd);
      saveItems(acc, ownerName, items);
      if (items.length < PAGE_LIMIT) break;
      // Ліміт 500 — гортаємо далі від найстарішої отриманої
      const oldest = Math.min(...items.map((i) => i.time));
      pageEnd = oldest < pageEnd ? oldest : pageEnd - 1;
    }
  }
}

function upsertAccounts(list: MonoAccount[]) {
  const now = Math.floor(Date.now() / 1000);
  for (const a of list) {
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
}

function isOwnTransfer(item: MonoStatementItem, ownerName: string) {
  if (/^(на|з) банк[уи]/i.test(item.description)) return true;
  if (/(гривнев|доларов|євров)\w* рахун/i.test(item.description)) return true;
  return !!item.counterName && item.counterName.trim().toLowerCase() === ownerName.trim().toLowerCase();
}

function saveItems(acc: MonoAccount, ownerName: string, items: MonoStatementItem[]) {
  if (items.length === 0) return;
  const rows: NewTransaction[] = items.map((i) => ({
    id: `mono:${i.id}`,
    accountId: `mono:${acc.id}`,
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
    isTransfer: isOwnTransfer(i, ownerName),
    hold: i.hold,
    raw: JSON.stringify(i),
  }));

  db.transaction((tx) => {
    for (const row of rows) {
      tx.insert(transactions)
        .values(row)
        .onConflictDoUpdate({
          target: transactions.id,
          // category свідомо не перезаписуємо — її можна буде правити вручну
          set: {
            amount: sql`excluded.amount`,
            operationAmount: sql`excluded.operation_amount`,
            description: sql`excluded.description`,
            commission: sql`excluded.commission`,
            cashback: sql`excluded.cashback`,
            balanceAfter: sql`excluded.balance_after`,
            hold: sql`excluded.hold`,
            raw: sql`excluded.raw`,
          },
        })
        .run();
    }
  });
}

const fmt = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
