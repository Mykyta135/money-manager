import { Suspense } from "react";
import { connection } from "next/server";
import { Card, Loading, Stat } from "@/components/ui";
import { MonthlyChart } from "@/components/monthly-chart";
import { expensesByCategory, feesSince, monthlySummary, overview } from "@/lib/stats";
import { formatDate, formatMoney } from "@/lib/format";

export default function Home() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Огляд</h1>
      <Suspense fallback={<Loading />}>
        <Dashboard />
      </Suspense>
    </div>
  );
}

async function Dashboard() {
  await connection(); // дані з SQLite — тільки під час запиту, не на білді

  const o = overview();
  const months = monthlySummary(12);
  const now = new Date();
  const monthStart = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
  const yearAgo = Math.floor(now.getTime() / 1000) - 365 * 86_400;
  const categories = expensesByCategory(monthStart);
  const fees = feesSince(yearAgo);

  // Середній залишок за останні 3 повні місяці
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const full = months.filter((m) => m.month < thisMonth).slice(-3);
  const avgSaved = full.length ? full.reduce((s, m) => s + m.income - m.expense, 0) / full.length : 0;

  const loansOverpaid = o.loans.reduce((s, l) => s + l.stats.overpaidSoFar, 0);
  const loansOverpayTotal = o.loans.reduce((s, l) => s + l.stats.overpayment, 0);
  const current = months.find((m) => m.month === thisMonth);

  if (o.accounts.length === 0) {
    return (
      <Card>
        <p className="text-sm">
          Даних ще нема. Додай <code>MONO_TOKEN</code> у <code>.env.local</code> і запусти{" "}
          <code>npm run sync:mono</code>, або імпортуй виписку на сторінці «Імпорт».
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Власні гроші (UAH)" value={formatMoney(o.ownUah)} bad={o.ownUah < 0} hint="баланси мінус кредитні ліміти й овердрафти" />
        <Stat label="Чисті активи" value={formatMoney(o.netWorth)} bad={o.netWorth < 0} hint={`борг по кредитах ${formatMoney(o.loansRemaining)}`} />
        <Stat
          label="В середньому лишається / міс"
          value={formatMoney(avgSaved)}
          bad={avgSaved < 0}
          hint="дохід мінус витрати, останні 3 міс"
        />
        <Stat
          label="Втрачено на кредитах і комісіях"
          value={formatMoney(loansOverpaid + fees)}
          bad
          hint={`переплата кредитів ${formatMoney(loansOverpaid)} з ${formatMoney(loansOverpayTotal)}, комісії за рік ${formatMoney(fees)}`}
        />
      </div>

      <Card title="Дохід і витрати по місяцях">
        <MonthlyChart data={months} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Витрати цього місяця: ${formatMoney(current?.expense ?? 0)}`}>
          <ul className="space-y-2 text-sm">
            {categories.map((c) => (
              <li key={c.category} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate">{c.category}</span>
                <span className="h-2 flex-1 rounded-full bg-line">
                  <span
                    className="block h-2 rounded-full bg-expense"
                    style={{ width: `${(c.total / categories[0].total) * 100}%` }}
                  />
                </span>
                <span className="num w-24 text-right">{formatMoney(c.total)}</span>
              </li>
            ))}
            {categories.length === 0 && <li className="text-muted">Поки нічого</li>}
          </ul>
        </Card>

        <Card title="Рахунки">
          <ul className="space-y-2 text-sm">
            {o.accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-x-3">
                <span>{a.name}</span>
                <span className="num">
                  {formatMoney((a.balance ?? 0) - a.creditLimit, a.currency)}
                  {a.creditLimit > 0 && (
                    <span className="text-muted"> (ліміт {formatMoney(a.creditLimit, a.currency)})</span>
                  )}
                </span>
                {a.debt > 0 && (
                  <span className="num basis-full text-right text-xs text-bad">
                    борг (овердрафт): −{formatMoney(a.debt, a.currency)}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Моно оновлено: {o.lastMonoSync ? formatDate(o.lastMonoSync) : "ще ні"}
          </p>
        </Card>
      </div>
    </div>
  );
}
