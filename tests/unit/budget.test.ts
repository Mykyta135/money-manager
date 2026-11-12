import { describe, expect, it } from "vitest";
import type { Budget } from "@/db/schema";
import { allocate, budgetSummary, cycleBudget, debtPayoff, expectedPayday, type CycleOptions } from "@/lib/budget";

const B = (id: string, categories: string[], limit: number, sort = 0): Budget => ({ id, name: id, categories, limitUah: limit * 100, sort });
const tx = (category: string, uah: number, day: number) => ({ category, amount: -uah * 100, isTransfer: false, time: Math.floor(new Date(2026, 10, day, 12).getTime() / 1000) });

const budgets = [B("food", ["Продукти"], 6000), B("snacks", ["Перекуси й напої"], 1000)];
const opts = (o: Partial<CycleOptions> = {}): CycleOptions => ({
  paydayDay: 9,
  savings: 1_000_000,
  salary: { amount: 4_000_000, at: new Date(2026, 10, 9, 10).getTime() },
  fallbackIncome: 3_900_000,
  loanPaymentsBetween: () => 1_400_000,
  ...o,
});

describe("expectedPayday", () => {
  it("лишає робочий день як є", () => {
    expect(expectedPayday(2026, 9, 9).getDate()).toBe(9); // 9.10.2026 — п'ятниця
  });
  it("переносить вихідний на понеділок", () => {
    expect(expectedPayday(2026, 10, 7).getDate()).toBe(9); // 7.11.2026 — субота → пн 9.11
  });
});

describe("budgetSummary", () => {
  it("рахує витрачене тільки по категоріях бюджету, без переказів", () => {
    const s = budgetSummary(budgets, [
      { category: "Продукти", amount: -50_000, isTransfer: false },
      { category: "Продукти", amount: -10_000, isTransfer: true },
      { category: "Таксі", amount: -20_000, isTransfer: false },
    ], new Date(2026, 10, 10));
    expect(s.totalSpent).toBe(50_000);
  });
});

describe("cycleBudget", () => {
  const now = new Date(2026, 10, 15, 12);

  it("цикл від ЗП до наступної очікуваної ЗП", () => {
    const c = cycleBudget(budgets, [], opts(), now);
    expect(c.from.getDate()).toBe(9);
    expect(c.to.getMonth()).toBe(11);
    expect(c.to.getDate()).toBe(9);
  });

  it("правило 10k: спершу банка, потім розстрочки, решта на життя", () => {
    const c = cycleBudget(budgets, [], opts(), now);
    expect(c.savings).toBe(1_000_000);
    expect(c.life).toBe(4_000_000 - 1_000_000 - 1_400_000);
    expect(c.scale).toBe(1); // 16 000 на життя ≥ 7 000 запланованих
    expect(c.surplus).toBe(1_600_000 - 700_000);
  });

  it("менша ЗП пропорційно урізає ліміти, банку не чіпає", () => {
    const c = cycleBudget(budgets, [], opts({ salary: { amount: 2_750_000, at: new Date(2026, 10, 9).getTime() } }), now);
    expect(c.life).toBe(350_000);
    expect(c.scale).toBeCloseTo(0.5);
    expect(c.budgets.find((b) => b.id === "food")!.limitUah).toBe(300_000);
  });

  it("якщо ЗП не покриває банку й розстрочки — shortfall", () => {
    const c = cycleBudget(budgets, [], opts({ salary: { amount: 2_000_000, at: new Date(2026, 10, 9).getTime() } }), now);
    expect(c.shortfall).toBe(400_000);
    expect(c.safeToday).toBe(0);
  });

  it("після зриву «можна сьогодні» на наступні дні зменшується (перевитрата розмазується)", () => {
    const before = cycleBudget(budgets, [tx("Продукти", 1000, 12)], opts(), now);
    const after = cycleBudget(budgets, [tx("Продукти", 1000, 12), tx("Перекуси й напої", 2000, 15)], opts(), now);
    expect(after.safeToday).toBeLessThan(before.safeToday);
    // 2 000 ₴ зриву розкладаються на всі дні, що лишились до ЗП
    expect(Math.abs(before.safeToday - after.safeToday - 200_000 / before.daysLeft)).toBeLessThanOrEqual(1);
    expect(after.budgets.find((b) => b.id === "snacks")!.left).toBeLessThan(0);
  });

  it("ЗП запізнилась: новий цикл від очікуваної дати, витрати після неї рахуються", () => {
    const late = new Date(2026, 11, 10, 12);
    const spent = { category: "Продукти", amount: -50_000, isTransfer: false, time: Math.floor(new Date(2026, 11, 10, 9).getTime() / 1000) };
    const c = cycleBudget(budgets, [spent], opts(), late);
    expect(c.from.toLocaleDateString("sv-SE")).toBe("2026-12-09");
    expect(c.to.toLocaleDateString("sv-SE")).toBe("2027-01-11"); // 9 січня — субота
    expect(c.incomeKnown).toBe(false);
    expect(c.totalSpent).toBe(50_000);
  });

  it("ЗП прийшла раніше: цикл з дня фактичної ЗП", () => {
    const c = cycleBudget(budgets, [], opts({ salary: { amount: 4_000_000, at: new Date(2026, 11, 4, 10).getTime() } }), new Date(2026, 11, 5, 12));
    expect(c.from.toLocaleDateString("sv-SE")).toBe("2026-12-04");
    expect(c.incomeKnown).toBe(true);
  });

  it("без ЗП у циклі рахує від середньої", () => {
    const c = cycleBudget(budgets, [], opts({ salary: null }), now);
    expect(c.incomeKnown).toBe(false);
    expect(c.income).toBe(3_900_000);
  });
});

describe("спершу борг", () => {
  // реальні цифри листопада 2026: зп ~39 800, розстрочки 14 108, ліміти 20 500, мінус на картці ~28 500
  const real = { income: 3_980_000, loans: 1_410_800, planned: 2_050_000, savingsTarget: 1_000_000 };

  it("є мінус: відкласти 0, ліміти не урізані, решта закриває мінус", () => {
    const a = allocate({ ...real, debt: 2_850_000 });
    expect(a.savings).toBe(0);
    expect(a.scale).toBe(1);
    expect(a.paydown).toBe(3_980_000 - 1_410_800 - 2_050_000);
    expect(a.debtAfter).toBe(2_850_000 - a.paydown);
  });

  it("малий мінус: закрили — залишок іде у відкладання", () => {
    const a = allocate({ ...real, debt: 100_000 });
    expect(a.debtAfter).toBe(0);
    expect(a.savings).toBe(3_980_000 - 1_410_800 - 2_050_000 - 100_000);
  });

  it("зп не покриває навіть розстрочки — ліміти в нуль, shortfall", () => {
    const a = allocate({ ...real, income: 1_000_000, debt: 500_000 });
    expect(a.life).toBe(0);
    expect(a.shortfall).toBe(410_800);
  });

  it("мінус закриється, коли розстрочки зменшаться", () => {
    const loans = [1_410_800, 1_305_100, 1_305_100, 948_400, 854_100];
    const k = debtPayoff({ debt: 2_850_000, income: real.income, planned: real.planned, loansFor: (i) => loans[i] ?? 578_900 });
    expect(k).toBe(5); // 5 зарплат: листопад…березень
  });

  it("витрати більші за зп — мінус не закривається", () => {
    expect(debtPayoff({ debt: 1_000_000, income: 3_000_000, planned: 2_000_000, loansFor: () => 1_000_000 })).toBeNull();
  });

  it("цикл бере мінус на початок циклу з carryAt", () => {
    const c = cycleBudget(budgets, [], opts({ carryAt: () => -1_000_000 }), new Date(2026, 10, 15, 12));
    // 40 000 − 14 000 розстрочок − 7 000 лімітів = 19 000: закрили 10 000 мінусу, 9 000 відкладаємо
    expect(c.debt).toBe(1_000_000);
    expect(c.debtAfter).toBe(0);
    expect(c.savings).toBe(900_000);
    expect(c.savingsTarget).toBe(1_000_000);
  });
});

describe("тільки обов'язкове", () => {
  it("необов'язкові бюджети заморожуються на витраченому, обов'язкові лишаються", () => {
    const list = [B("food", ["Продукти"], 6000), B("going-out", ["Кафе"], 3000)];
    const c = cycleBudget(list, [tx("Продукти", 1000, 12), tx("Кафе", 500, 12)], opts({ essentialOnly: new Set(["food"]) }), new Date(2026, 10, 15, 12));
    expect(c.essentialOnly).toBe(true);
    expect(c.budgets.find((b) => b.id === "going-out")!.left).toBe(0);
    expect(c.budgets.find((b) => b.id === "food")!.left).toBe(500_000);
  });
});
