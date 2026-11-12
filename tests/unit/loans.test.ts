import { describe, expect, it } from "vitest";
import type { Loan } from "@/db/schema";
import { loanStats, paymentDates, paymentSchedule } from "@/lib/loans";

const loan = (o: Partial<Loan>): Loan => ({ id: 1, bank: "mono", name: "x", principal: 0, monthlyPayment: 0, termMonths: 1, startDate: "2026-01-01", oneTimeFee: 0, notes: null, ...o });

describe("loanStats", () => {
  it("розстрочка на картку 9 322 / 12 × 953,95 → переплата 2 125,40, ~48% річних", () => {
    const s = loanStats(loan({ principal: 932_200, monthlyPayment: 95_395, termMonths: 12, startDate: "2026-09-30" }), new Date(2026, 10, 2));
    expect(s.overpayment).toBe(212_540);
    expect(s.effectiveAnnualRate).toBeGreaterThan(0.47);
    expect(s.effectiveAnnualRate).toBeLessThan(0.49);
    expect(s.monthsPaid).toBe(2);
  });

  it("0% покупка частинами — без переплати і ставки", () => {
    const s = loanStats(loan({ principal: 2_140_000, monthlyPayment: 356_667, termMonths: 6 }));
    expect(s.overpayment).toBeLessThanOrEqual(2);
    expect(s.effectiveAnnualRate).toBe(0);
  });
});

describe("paymentSchedule", () => {
  const today = new Date(2026, 10, 2);
  const garminMono = loan({ id: 1, name: "Garmin моно", monthlyPayment: 356_667, termMonths: 6, startDate: "2026-08-31" });
  const garminPumb = loan({ id: 2, bank: "pumb", name: "Garmin ПУМБ", monthlyPayment: 199_980, termMonths: 15, startDate: "2026-09-30" });

  it("моно-частина Фенікса закінчується в січні 2027, ПУМБ — у листопаді 2027", () => {
    const sched = paymentSchedule([garminMono, garminPumb], 14, today);
    expect(sched.find((m) => m.month === "2027-01")!.ending).toEqual(["Garmin моно"]);
    expect(sched.find((m) => m.month === "2027-11")!.ending).toEqual(["Garmin ПУМБ"]);
    expect(sched.find((m) => m.month === "2027-02")!.total).toBe(199_980);
    expect(sched.find((m) => m.month === "2027-12")!.total).toBe(0);
  });
});

describe("paymentDates", () => {
  it("31 число в коротких місяцях → останній день місяця, а не 1-ше наступного", () => {
    const d = paymentDates("2026-08-31", 6).map((x) => x.toLocaleDateString("sv-SE"));
    expect(d).toEqual(["2026-08-31", "2026-09-30", "2026-10-31", "2026-11-30", "2026-12-31", "2027-01-31"]);
  });
  it("лютий", () => {
    expect(paymentDates("2027-01-30", 2)[1].toLocaleDateString("sv-SE")).toBe("2027-02-28");
  });
});
