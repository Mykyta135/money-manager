import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { accounts, transactions } from "@/db/schema";
import { Loading } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";

const BANKS = ["mono", "ukrsib", "pumb"] as const;

export default function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Транзакції</h1>
      <Suspense fallback={<Loading />}>
        <List searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function List({ searchParams }: Pick<PageProps<"/transactions">, "searchParams">) {
  await connection();
  const { bank, category } = await searchParams;

  const where: SQL[] = [];
  if (typeof bank === "string" && (BANKS as readonly string[]).includes(bank))
    where.push(eq(transactions.bank, bank as (typeof BANKS)[number]));
  if (typeof category === "string") where.push(eq(transactions.category, category));

  const rows = db
    .select()
    .from(transactions)
    .where(and(...where))
    .orderBy(desc(transactions.time))
    .limit(300)
    .all();
  const currencyOf = new Map(db.select().from(accounts).all().map((a) => [a.id, a.currency]));

  return (
    <>
      <div className="flex gap-2 text-sm">
        {[undefined, ...BANKS].map((b) => (
          <Link
            key={b ?? "all"}
            href={b ? `/transactions?bank=${b}` : "/transactions"}
            className={`rounded-full border border-line px-3 py-1 ${bank === b ? "bg-foreground text-background" : ""}`}
          >
            {b ?? "Усі"}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="p-2">Дата</th>
              <th className="p-2">Опис</th>
              <th className="p-2">Категорія</th>
              <th className="p-2">Банк</th>
              <th className="p-2 text-right">Сума</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className={`border-t border-line ${t.isTransfer ? "opacity-50" : ""}`}>
                <td className="num whitespace-nowrap p-2">{formatDate(t.time)}</td>
                <td className="p-2">
                  {t.description}
                  {t.comment && <span className="text-muted"> — {t.comment}</span>}
                </td>
                <td className="p-2">
                  <Link href={`/transactions?category=${encodeURIComponent(t.category)}`}>{t.category}</Link>
                  {t.isTransfer && <span className="text-muted"> · між своїми</span>}
                </td>
                <td className="p-2">{t.bank}</td>
                <td className={`num whitespace-nowrap p-2 text-right ${t.amount > 0 ? "text-income" : ""}`}>
                  {t.amount > 0 ? "+" : ""}
                  {formatMoney(t.amount, currencyOf.get(t.accountId))}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-muted">
                  Нічого не знайдено
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
