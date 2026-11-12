import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/db";
import { loans } from "@/db/schema";
import { Card, Loading, Stat } from "@/components/ui";
import { loanStats, paymentSchedule } from "@/lib/loans";
import { formatMoney, formatPercent } from "@/lib/format";
import { addLoan, deleteLoan } from "./actions";

export default function LoansPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Кредити та розстрочки</h1>
      <Suspense fallback={<Loading />}>
        <LoanList />
      </Suspense>
      <Card title="Додати">
        <LoanForm />
      </Card>
    </div>
  );
}

const MONTHS = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;

async function LoanList() {
  await connection();
  const rows = db.select().from(loans).all();
  if (rows.length === 0) return <p className="text-sm text-muted">Кредитів ще не додано.</p>;

  const stats = rows.map((l) => loanStats(l));
  const schedule = paymentSchedule(rows, 30).filter((m) => m.total > 0);
  const max = Math.max(...schedule.map((m) => m.total));
  const sum = (f: (s: (typeof stats)[number]) => number) => stats.reduce((a, s) => a + f(s), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Лишилось заплатити" value={formatMoney(sum((s) => s.remaining))} bad />
        <Stat label="Платежі цього місяця" value={formatMoney(schedule[0]?.total ?? 0)} bad />
        <Stat label="Переплата по всіх" value={formatMoney(sum((s) => s.overpayment))} hint={`вже переплачено ${formatMoney(sum((s) => s.overpaidSoFar))}`} />
        <Stat label="Останній платіж" value={schedule.at(-1) ? monthLabel(schedule.at(-1)!.month) : "—"} />
      </div>

      <Card title="Скільки йде на кредити щомісяця — і коли звільняться гроші">
        <ul className="space-y-1.5 text-sm">
          {schedule.map((m) => (
            <li key={m.month} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-muted">{monthLabel(m.month)}</span>
              <span className="h-2 flex-1 rounded-full bg-line">
                <span className="block h-2 rounded-full bg-expense" style={{ width: `${(m.total / max) * 100}%` }} />
              </span>
              <span className="num w-24 text-right">{formatMoney(m.total)}</span>
              <span className="hidden w-64 truncate text-xs text-muted md:block">
                {m.ending.length > 0 && `останній: ${m.ending.join(", ")}`}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
      {rows.map((l) => {
        const s = loanStats(l);
        return (
          <Card key={l.id} title={`${l.name} · ${l.bank}`}>
            <dl className="num grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-muted">Отримав</dt>
              <dd className="text-right">{formatMoney(l.principal)}</dd>
              <dt className="text-muted">Віддам усього</dt>
              <dd className="text-right">{formatMoney(s.totalToPay)}</dd>
              <dt className="text-muted">Переплата</dt>
              <dd className="text-right text-bad">{formatMoney(s.overpayment)}</dd>
              <dt className="text-muted">Реальна річна ставка</dt>
              <dd className="text-right text-bad">{formatPercent(s.effectiveAnnualRate)}</dd>
              <dt className="text-muted">Сплачено</dt>
              <dd className="text-right">
                {formatMoney(s.paidSoFar)} ({s.monthsPaid}/{l.termMonths} міс)
              </dd>
              <dt className="text-muted">Лишилось</dt>
              <dd className="text-right">
                {formatMoney(s.remaining)} ({s.monthsLeft} міс)
              </dd>
            </dl>
            {l.notes && <p className="mt-2 text-xs text-muted">{l.notes}</p>}
            <form action={deleteLoan.bind(null, l.id)} className="mt-3">
              <button className="text-xs text-muted hover:text-bad">Видалити</button>
            </form>
          </Card>
        );
      })}
      </div>
    </div>
  );
}

const input = "w-full rounded-md border border-line bg-background px-2 py-1.5 text-sm";

function LoanForm() {
  return (
    <form action={addLoan} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">
        Назва
        <input name="name" placeholder="Розстрочка на телефон" className={input} />
      </label>
      <label className="text-sm">
        Банк
        <select name="bank" defaultValue="pumb" className={input}>
          <option value="pumb">ПУМБ</option>
          <option value="mono">monobank</option>
          <option value="ukrsib">Укрсиббанк</option>
        </select>
      </label>
      <label className="text-sm">
        Сума кредиту / ціна товару, ₴
        <input name="principal" required inputMode="decimal" className={input} />
      </label>
      <label className="text-sm">
        Щомісячний платіж (з комісією), ₴
        <input name="monthlyPayment" required inputMode="decimal" className={input} />
      </label>
      <label className="text-sm">
        Строк, місяців
        <input name="termMonths" type="number" min={1} required className={input} />
      </label>
      <label className="text-sm">
        Дата першого платежу
        <input name="startDate" type="date" required className={input} />
      </label>
      <label className="text-sm">
        Разова комісія, ₴
        <input name="oneTimeFee" inputMode="decimal" placeholder="0" className={input} />
      </label>
      <label className="text-sm">
        Нотатки
        <input name="notes" className={input} />
      </label>
      <button className="rounded-md bg-foreground px-4 py-2 text-sm text-background sm:col-span-2">
        Додати
      </button>
    </form>
  );
}
