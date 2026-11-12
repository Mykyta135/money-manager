import type { Loan } from "@/db/schema";

export type LoanStats = {
  totalToPay: number;
  overpayment: number;
  monthsPaid: number;
  monthsLeft: number;
  paidSoFar: number;
  remaining: number;
  overpaidSoFar: number;
  effectiveAnnualRate: number; // реальна річна ставка, 0.35 = 35%
};

function monthsBetween(start: Date, end: Date) {
  let m = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
  if (end.getDate() >= start.getDate()) m += 1; // платіж у день старту вже відбувся
  return m;
}

// Місячна ставка r, за якої сума дисконтованих платежів = отриманим грошам (IRR)
function monthlyIrr(received: number, payment: number, n: number) {
  // До копійки на платіж — це округлення банку (21 400 / 6 = 3 566,67), а не відсотки
  if (payment * n - received <= n) return 0;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 100; i++) {
    const r = (lo + hi) / 2;
    const pv = (payment * (1 - Math.pow(1 + r, -n))) / r;
    if (pv > received) lo = r;
    else hi = r;
  }
  return (lo + hi) / 2;
}

/**
 * Дати платежів: перший платіж + k місяців. Якщо в місяці нема такого числа (31 листопада),
 * банк списує останнього дня місяця — а не переносить на 1 число наступного.
 */
export function paymentDates(start: string, term: number) {
  const s = new Date(start);
  return Array.from({ length: term }, (_, k) => {
    const last = new Date(s.getFullYear(), s.getMonth() + k + 1, 0).getDate();
    return new Date(s.getFullYear(), s.getMonth() + k, Math.min(s.getDate(), last));
  });
}

export type ScheduleMonth = { month: string; total: number; ending: string[] };

/** Скільки треба платити по всіх кредитах у кожному з наступних місяців (починаючи з поточного) */
export function paymentSchedule(list: Loan[], months = 24, today = new Date()): ScheduleMonth[] {
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    let total = 0;
    const ending: string[] = [];
    for (const l of list) {
      const start = new Date(l.startDate);
      const k = (d.getFullYear() - start.getFullYear()) * 12 + d.getMonth() - start.getMonth();
      if (k < 0 || k >= l.termMonths) continue;
      total += l.monthlyPayment;
      if (k === l.termMonths - 1) ending.push(l.name);
    }
    return { month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, total, ending };
  });
}

export function loanStats(loan: Loan, today = new Date()): LoanStats {
  const n = loan.termMonths;
  const totalToPay = loan.monthlyPayment * n + loan.oneTimeFee;
  const overpayment = totalToPay - loan.principal;
  const monthsPaid = Math.min(n, Math.max(0, monthsBetween(new Date(loan.startDate), today)));
  const r = monthlyIrr(loan.principal - loan.oneTimeFee, loan.monthlyPayment, n);

  return {
    totalToPay,
    overpayment,
    monthsPaid,
    monthsLeft: n - monthsPaid,
    paidSoFar: loan.monthlyPayment * monthsPaid + loan.oneTimeFee,
    remaining: loan.monthlyPayment * (n - monthsPaid),
    // Для розстрочки з фіксованою комісією переплата розподілена рівномірно
    overpaidSoFar: loan.oneTimeFee + ((overpayment - loan.oneTimeFee) * monthsPaid) / n,
    effectiveAnnualRate: Math.pow(1 + r, 12) - 1,
  };
}
