import { describe, expect, it } from "vitest";
import { projectDebt, realityCheck, type RealityInput } from "@/lib/reality";

// реальні цифри листопада 2026
const loans = [1_410_800, 1_305_100, 1_305_100, 948_400, 854_100];
const base: RealityInput = {
  savingsTarget: 1_000_000,
  planned: 2_050_000,
  trendMonthly: 3_180_000,
  incomes: [4_132_700, 3_483_300, 4_319_800],
  holeAtPayday: 3_460_000,
  creditLimit: 1_600_000,
  overLimitNow: 1_007_700,
  overLimitFees12m: 54_500,
  loansFor: (k) => loans[k] ?? 578_900,
};
const keys = (i: RealityInput) => realityCheck(i).findings.map((f) => f.key);

describe("projectDebt", () => {
  it("мінус росте, коли витрати більші за зп мінус розстрочки", () => {
    const r = projectDebt({ debt: 1_000_000, income: 4_000_000, spend: 3_500_000, loansFor: () => 1_000_000 });
    expect(r.cycles).toBeNull();
    expect(r.firstDelta).toBe(-500_000);
  });
  it("закривається за кілька зп", () => {
    expect(projectDebt({ debt: 1_000_000, income: 4_000_000, spend: 2_000_000, loansFor: () => 1_000_000 }).cycles).toBe(1);
  });
});

describe("realityCheck на реальних цифрах", () => {
  it("бачить усі проблеми", () => {
    expect(keys(base)).toEqual(["limits", "debt-trend", "savings", "over-limit"]);
    // слабка зп (34 833) ще вкладається в ліміти — не шумимо; при 30 000 — вже ні
    expect(keys({ ...base, incomes: [4_132_700, 3_000_000, 4_319_800] })).toContain("salary");
  });
  it("при твоєму темпі мінус спершу росте й закривається набагато пізніше", () => {
    const r = realityCheck(base);
    const f = r.findings.find((x) => x.key === "debt-trend")!;
    expect(f.tone).toBe("bad"); // на 25 зп пізніше
    expect(f.detail).toContain("росте");
    expect(r.atTrend!).toBeGreaterThan(r.atLimits! + 3);
  });
  it("витрати назавжди більші за зп — мінус не закриється", () => {
    const f = realityCheck({ ...base, trendMonthly: 4_000_000 }).findings.find((x) => x.key === "debt-trend")!;
    expect(f.tone).toBe("bad");
  });
  it("в межах лімітів — закривається", () => {
    expect(realityCheck(base).atLimits).not.toBeNull();
  });
  it("здорова ситуація — тихо", () => {
    expect(keys({ ...base, trendMonthly: 2_000_000, holeAtPayday: 0, overLimitNow: 0, incomes: [4_000_000, 4_100_000, 3_900_000], loansFor: () => 800_000 })).toEqual([]);
  });
});
