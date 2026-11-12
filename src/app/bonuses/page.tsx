import { Suspense } from "react";
import { connection } from "next/server";
import { Card, Loading, Stat } from "@/components/ui";
import { expiringSoon, monoCategoryPlan, offerEstimates, wallet, type OfferEstimate } from "@/lib/rewards";
import { formatMoney } from "@/lib/format";
import { toggleOffer } from "./actions";

export default function BonusesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Бонуси, кешбек і акції</h1>
      <Suspense fallback={<Loading />}>
        <Bonuses />
      </Suspense>
    </div>
  );
}

async function Bonuses() {
  await connection();
  const w = wallet();
  const plan = monoCategoryPlan(2);
  const all = offerEstimates().filter((o) => !o.expired);
  const soon = expiringSoon(14);
  const relevant = all.filter((o) => o.kind !== "category" && (o.purchases > 0 || o.kind === "promo"));
  const others = all.filter((o) => o.kind !== "category" && !relevant.includes(o));
  const sum = (list: OfferEstimate[], f: (o: OfferEstimate) => number) => list.reduce((s, o) => s + f(o), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Бонуси на рахунках"
          value={`≈ ${formatMoney(w.totalUah)}`}
          hint={w.unknownValue ? `+ ${w.unknownValue} без оцінки (Обіймашки)` : undefined}
        />
        <Stat
          label="Кешбек моно/міс з власних"
          value={formatMoney(sum(plan.picks, (o) => o.expectedOwn))}
          hint={`з кредитних лише ${formatMoney(sum(plan.picks, (o) => o.expectedCredit))}`}
        />
        <Stat label="Згорає за 14 днів" value={String(soon.rewards.length + soon.offers.length)} bad={soon.offers.length > 0} />
        <Stat label="Акцій відстежується" value={String(all.length)} />
      </div>

      {(soon.offers.length > 0 || soon.rewards.length > 0) && (
        <Card title="⏰ Скоро згорить">
          <ul className="space-y-1 text-sm">
            {soon.offers.map((o) => (
              <li key={o.id}>
                <b>{o.title}</b> — ще {o.daysLeft} дн. {o.notes && <span className="text-muted">· {o.notes}</span>}
              </li>
            ))}
            {soon.rewards.map((r) => (
              <li key={r.id}>
                <b>{r.program}</b>: {r.balance} {r.unit} — ще {r.daysLeft} дн.
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Категорії кешбеку моно цього місяця — що підключити">
        <p className="mb-3 text-xs text-muted">
          Оцінка по твоїх витратах за 90 днів. Ставка діє з власних коштів — з кредитних лише 0,75%.
        </p>
        <OfferTable list={[...plan.picks, ...plan.rest]} highlight={new Set(plan.picks.map((p) => p.id))} />
      </Card>

      <Card title="Гаманець">
        <ul className="divide-y divide-line text-sm">
          {w.list.map((r) => (
            <li key={r.id} className="py-2">
              <div className="flex justify-between gap-3">
                <b>{r.program}</b>
                <span className="num">
                  {r.balance.toLocaleString("uk-UA")} {r.unit}
                  {r.valueUah !== null && <span className="text-muted"> ≈ {formatMoney(r.valueUah)}</span>}
                </span>
              </div>
              {r.howToUse && <p className="text-xs text-muted">{r.howToUse}</p>}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Акції, які тобі реально підходять">
        <OfferTable list={relevant} />
      </Card>

      <Card title="Решта (тільки якщо й так плануєш купити)">
        <OfferTable list={others} />
      </Card>
    </div>
  );
}

function OfferTable({ list, highlight }: { list: OfferEstimate[]; highlight?: Set<string> }) {
  if (list.length === 0) return <p className="text-sm text-muted">Нічого</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="py-1 pr-2">Акція</th>
            <th className="py-1 pr-2 text-right">Ти витрачаєш/міс</th>
            <th className="py-1 pr-2 text-right">Вигода/міс</th>
            <th className="py-1 pr-2">До</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {list.map((o) => (
            <tr key={o.id} className={`border-t border-line ${highlight?.has(o.id) ? "font-semibold" : ""}`}>
              <td className="py-1.5 pr-2">
                {highlight?.has(o.id) && "✅ "}
                {o.title}
                {o.ratePct !== null && (
                  <span className="text-muted">
                    {" "}
                    · {o.ratePct}%{o.creditRatePct !== null && ` / ${o.creditRatePct}% кред.`}
                  </span>
                )}
                {o.notes && <div className="text-xs font-normal text-muted">{o.notes}</div>}
              </td>
              <td className="num py-1.5 pr-2 text-right">{o.monthlySpend ? formatMoney(o.monthlySpend) : "—"}</td>
              <td className="num py-1.5 pr-2 text-right">{o.expectedOwn ? formatMoney(o.expectedOwn) : "—"}</td>
              <td className="py-1.5 pr-2 text-xs text-muted">{o.validUntil ?? "—"}</td>
              <td className="py-1.5 text-right">
                <form action={toggleOffer.bind(null, o.id, !o.activated)}>
                  <button className={`rounded-full border border-line px-2 py-0.5 text-xs ${o.activated ? "bg-foreground text-background" : ""}`}>
                    {o.activated ? "підключено" : "підключити"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
