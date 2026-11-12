import { expectedPayday } from "@/lib/budget";
import { allLoans, paymentDates, settings, subscriptions } from "./data";
import { getState } from "./state";

// Календар обов'язкових витрат на місяць: розстрочки, підписки, плановий похід по продукти, день ЗП

export type CalEvent = { title: string; amount: number; kind: "loan" | "sub" | "groceries" | "payday" };
export type GroceryPlan = { weekday: number; amount: number }; // 0 = неділя … 6 = субота; копійки

export const groceryPlan = (): GroceryPlan => getState<GroceryPlan>("plan:groceries") ?? { weekday: 6, amount: 150_000 };

export function monthCalendar(year: number, month: number) {
  const days = new Map<number, CalEvent[]>();
  const add = (d: Date, e: CalEvent) => {
    if (d.getFullYear() !== year || d.getMonth() !== month) return;
    days.set(d.getDate(), [...(days.get(d.getDate()) ?? []), e]);
  };

  for (const l of allLoans()) {
    for (const d of paymentDates(l.startDate, l.termMonths)) add(d, { title: l.name, amount: l.monthlyPayment, kind: "loan" });
  }

  // Підписка списується щомісяця приблизно того ж числа, що й наступне очікуване списання
  for (const s of subscriptions()) {
    const next = new Date(s.nextAt * 1000);
    const day = Math.min(next.getDate(), new Date(year, month + 1, 0).getDate());
    if (new Date(year, month, day) >= new Date(next.getFullYear(), next.getMonth(), 1)) {
      add(new Date(year, month, day), { title: s.name, amount: s.lastAmount, kind: "sub" });
    }
  }

  const g = groceryPlan();
  if (g.amount > 0) {
    for (let d = 1; d <= new Date(year, month + 1, 0).getDate(); d++) {
      const date = new Date(year, month, d);
      if (date.getDay() === g.weekday) add(date, { title: "похід по продукти", amount: g.amount, kind: "groceries" });
    }
  }

  add(expectedPayday(year, month, settings.paydayDay()), { title: "зарплата", amount: 0, kind: "payday" });

  const total = [...days.values()].flat().reduce((s, e) => s + e.amount, 0);
  return { days, total };
}

/** Суми обов'язкових витрат по тижнях (пн–нд) у межах місяця */
export function weeklyTotals(year: number, month: number, days: Map<number, CalEvent[]>) {
  const last = new Date(year, month + 1, 0).getDate();
  const weeks: { from: number; to: number; total: number }[] = [];
  let from = 1;
  for (let d = 1; d <= last; d++) {
    const isSunday = new Date(year, month, d).getDay() === 0;
    if (isSunday || d === last) {
      let total = 0;
      for (let k = from; k <= d; k++) total += (days.get(k) ?? []).reduce((s, e) => s + e.amount, 0);
      weeks.push({ from, to: d, total });
      from = d + 1;
    }
  }
  return weeks;
}
