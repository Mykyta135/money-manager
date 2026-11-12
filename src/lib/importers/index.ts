import { createHash } from "node:crypto";
import { db } from "@/db";
import { accounts, transactions, type NewTransaction } from "@/db/schema";
import { categorize } from "@/lib/categories";
import { markOwnTransfers } from "@/lib/transfers";
import type { Importer, ParsedStatement } from "./types";
import { ukrsibImporter } from "./ukrsib";

export const importers: Record<string, Importer> = {
  ukrsib: ukrsibImporter,
};

/** Зберігає виписку; повторний імпорт того ж періоду не створює дублів */
export function saveStatement(bank: Importer["bank"], st: ParsedStatement) {
  const accountId = `${bank}:${st.account.key}`;
  const acc = {
    id: accountId,
    bank,
    name: st.account.name,
    currency: st.account.currency,
    iban: st.account.iban ?? null,
    balance: st.account.balance ?? null,
    debt: st.account.debt ?? 0,
    cardMasks: st.account.cardMasks ?? null,
    updatedAt: Math.floor(Date.now() / 1000),
  };
  db.insert(accounts).values(acc).onConflictDoUpdate({ target: accounts.id, set: acc }).run();

  // Однакові операції в один момент (дві кави поспіль) розрізняємо порядковим номером
  const seen = new Map<string, number>();
  const rows: NewTransaction[] = st.rows.map((r) => {
    const base = `${accountId}|${r.externalId ?? `${r.time}|${r.amount}|${r.description}`}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return {
      id: `${bank}:${createHash("sha1").update(`${base}|${n}`).digest("hex").slice(0, 20)}`,
      accountId,
      bank,
      time: r.time,
      amount: r.amount,
      description: r.description,
      mcc: r.mcc ?? null,
      category: categorize(r.mcc, r.description),
      commission: r.commission ?? 0,
      balanceAfter: r.balanceAfter ?? null,
      counterName: r.counterName ?? null,
      counterIban: r.counterIban ?? null,
      isTransfer: r.isTransfer ?? false,
      raw: r.raw === undefined ? null : JSON.stringify(r.raw),
    };
  });

  let inserted = 0;
  db.transaction((tx) => {
    for (const row of rows) {
      inserted += tx.insert(transactions).values(row).onConflictDoNothing().run().changes;
    }
  });
  markOwnTransfers();
  return { total: rows.length, inserted, skipped: rows.length - inserted };
}
