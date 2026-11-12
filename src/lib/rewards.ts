import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { offers, rewards, transactions, type Offer } from "@/db/schema";

const DAY = 86_400;
const WINDOW_DAYS = 90;

export type OfferEstimate = Offer & {
  monthlySpend: number; // копійки, середнє за 90 днів по match
  purchases: number; // кількість покупок за 90 днів
  expectedOwn: number; // очікувана вигода/міс з власних коштів, копійки
  expectedCredit: number; // те саме, якщо платиш кредитними
  expired: boolean;
  daysLeft: number | null;
};

const today = () => new Date().toLocaleDateString("sv-SE");

function daysUntil(date: string | null) {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - new Date(today()).getTime()) / (DAY * 1000));
}

/** Витрати за останні 90 днів — по них оцінюємо, скільки реально дасть кожна акція */
function recentExpenses() {
  const since = Math.floor(Date.now() / 1000) - WINDOW_DAYS * DAY;
  return db
    .select({ amount: transactions.amount, description: transactions.description, category: transactions.category })
    .from(transactions)
    .where(and(gte(transactions.time, since), lt(transactions.amount, 0), eq(transactions.isTransfer, false)))
    .all();
}

export function offerEstimates(): OfferEstimate[] {
  const expenses = recentExpenses();
  const months = WINDOW_DAYS / 30;

  return db
    .select()
    .from(offers)
    .all()
    .map((o) => {
      // match перевіряємо по "категорія + опис", щоб можна було писати і /Таксі/, і /bolt|uklon/
      const re = o.match ? new RegExp(o.match, "i") : null;
      const hits = re ? expenses.filter((e) => re.test(`${e.category} ${e.description}`)) : [];
      const spend = hits.reduce((s, e) => s - e.amount, 0);
      const monthlySpend = Math.round(spend / months);
      const eligible = o.minPurchaseUah ? hits.filter((e) => -e.amount >= o.minPurchaseUah!).length : hits.length;

      const pct = (rate: number | null) => (rate ? Math.round((monthlySpend * rate) / 100) : 0);
      // Фіксований купон — рахуємо як одноразову вигоду, якщо ти взагалі там купуєш
      const fixed = o.fixedUah && (eligible > 0 || !re) ? o.fixedUah : 0;
      const daysLeft = daysUntil(o.validUntil);

      return {
        ...o,
        monthlySpend,
        purchases: hits.length,
        expectedOwn: pct(o.ratePct) + fixed,
        expectedCredit: pct(o.creditRatePct ?? o.ratePct) + fixed,
        expired: daysLeft !== null && daysLeft < 0,
        daysLeft,
      };
    })
    .sort((a, b) => b.expectedOwn - a.expectedOwn);
}

/** Які категорії кешбеку моно підключити: найбільша очікувана вигода з власних коштів */
export function monoCategoryPlan(slots = 3) {
  const cats = offerEstimates().filter((o) => o.source === "mono" && o.kind === "category" && !o.expired);
  return { picks: cats.slice(0, slots), rest: cats.slice(slots) };
}

export function wallet() {
  const list = db.select().from(rewards).all();
  return {
    list: list.map((r) => ({ ...r, daysLeft: daysUntil(r.expiresAt) })),
    totalUah: list.reduce((s, r) => s + (r.valueUah ?? 0), 0),
    unknownValue: list.filter((r) => r.valueUah === null).length,
  };
}

/** Що згорить у найближчі N днів: бонуси й акції, якими ти реально користуєшся */
export function expiringSoon(days = 14) {
  const soon = (d: number | null) => d !== null && d >= 0 && d <= days;
  return {
    rewards: wallet().list.filter((r) => soon(r.daysLeft)),
    offers: offerEstimates().filter((o) => soon(o.daysLeft) && (o.purchases > 0 || o.kind === "promo")),
  };
}
