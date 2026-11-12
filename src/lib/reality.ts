// Перевірки на реалізм: план порівнюється з тим, як ти реально витрачаєш і скільки реально заробляєш.
// Чиста логіка — для телефона й тестів. Суми в копійках.

export type Tone = "ok" | "warn" | "bad" | "gold";
export type Finding = { key: string; tone: Tone; title: string; value?: string; detail: string };

/** Бюджети, без яких не прожити: їжа, дорога, зв'язок, ліки. Решта при проблемах заморожується */
export const ESSENTIAL_BUDGETS = new Set(["food", "lunch", "transport", "subs", "home"]);

/**
 * Скільки зарплат треба, щоб закрити мінус при щомісячних витратах spend.
 * На відміну від debtPayoff, мінус тут може рости: якщо витрати більші за зп мінус розстрочки.
 * Повертає k (після k-ї ЗП мінус = 0) або null, і на скільки мінус змінюється в перший місяць.
 */
export function projectDebt(o: { debt: number; income: number; spend: number; loansFor: (k: number) => number; horizon?: number }) {
  let debt = o.debt;
  const firstDelta = o.income - o.loansFor(0) - o.spend; // + зменшує мінус, − збільшує
  for (let k = 0; k < (o.horizon ?? 36); k++) {
    if (debt <= 0) return { cycles: k, firstDelta };
    debt -= o.income - o.loansFor(k) - o.spend;
  }
  return { cycles: debt <= 0 ? (o.horizon ?? 36) : null, firstDelta };
}

const m = (v: number) => `${Math.round(Math.abs(v) / 100).toLocaleString("uk-UA")}`;

export type RealityInput = {
  savingsTarget: number;
  planned: number; // сума лімітів
  trendMonthly: number; // реальні витрати по бюджетних категоріях за місяць (середнє за 3 міс)
  incomes: number[]; // останні ЗП, від найновішої
  holeAtPayday: number; // мінус власних на день ЗП за прогнозом (≥ 0)
  creditLimit: number; // сума кредитних лімітів
  overLimitNow: number; // скільки зараз понад кредитний ліміт (≥ 0)
  overLimitFees12m: number; // штрафи за перевищення за рік
  loansFor: (k: number) => number; // розстрочки в k-му циклі від найближчої ЗП
};

export function realityCheck(i: RealityInput) {
  const findings: Finding[] = [];
  const incomeAvg = i.incomes.length ? Math.round(i.incomes.reduce((a, x) => a + x, 0) / i.incomes.length) : 0;
  const incomeMin = i.incomes.length ? Math.min(...i.incomes) : 0;

  // 1. Ліміти проти того, скільки реально йде
  if (i.trendMonthly > i.planned * 1.15) {
    findings.push({
      key: "limits",
      tone: "warn",
      title: "ліміти нижчі за реальні витрати",
      value: `${m(i.trendMonthly)}/міс`,
      detail: `ліміти ${m(i.planned)}, різниця ${m(i.trendMonthly - i.planned)} щомісяця — або різати, або чесно підняти ліміти`,
    });
  }

  // 2. Мінус на картці: коли закриється при лімітах і при твоєму темпі
  const atLimits = projectDebt({ debt: i.holeAtPayday, income: incomeAvg, spend: i.planned, loansFor: i.loansFor });
  const atTrend = projectDebt({ debt: i.holeAtPayday, income: incomeAvg, spend: i.trendMonthly, loansFor: i.loansFor });
  if (i.holeAtPayday > 0) {
    if (atTrend.cycles === null) {
      findings.push({
        key: "debt-trend",
        tone: "bad",
        title: "з твоїм темпом мінус не закриється",
        value: atTrend.firstDelta < 0 ? `+${m(-atTrend.firstDelta)}/міс` : undefined,
        detail: atTrend.firstDelta < 0 ? `витрати ${m(i.trendMonthly)} + розстрочки більші за зп ${m(incomeAvg)} — мінус росте` : "закривається надто повільно",
      });
    } else if (atLimits.cycles !== null && atTrend.cycles > atLimits.cycles) {
      findings.push({
        key: "debt-trend",
        tone: atTrend.cycles - atLimits.cycles > 12 ? "bad" : "warn",
        title: "з твоїм темпом — значно пізніше",
        value: `+${atTrend.cycles - atLimits.cycles} міс`,
        detail: `${atTrend.firstDelta < 0 ? `перші місяці мінус ще росте на ${m(-atTrend.firstDelta)}/міс; ` : ""}в межах лімітів — за ${atLimits.cycles} зп, з нинішніми витратами — за ${atTrend.cycles}`,
      });
    }
  }

  // 3. Чи реально відкласти ціль, коли мінуса нема (або вже закрито)
  const freeAtTrend = incomeAvg - i.loansFor(0) - i.trendMonthly;
  if (i.savingsTarget > 0 && freeAtTrend < i.savingsTarget) {
    findings.push({
      key: "savings",
      tone: i.holeAtPayday > 0 ? "warn" : "bad",
      title: `${m(i.savingsTarget)} з таким темпом не відкласти`,
      value: freeAtTrend > 0 ? `${m(freeAtTrend)}` : "0",
      detail:
        freeAtTrend > 0
          ? `після розстрочок і звичних витрат лишається ${m(freeAtTrend)}; щоб відкладати ${m(i.savingsTarget)}, витрачати ≤ ${m(incomeAvg - i.loansFor(0) - i.savingsTarget)}/міс`
          : `звичні витрати й розстрочки вже з'їдають усю зп`,
    });
  }

  // 4. ЗП плаває — що буде в слабкий місяць
  const lifeMin = incomeMin - i.loansFor(0);
  if (incomeMin > 0 && incomeAvg - incomeMin > incomeAvg * 0.1 && lifeMin < i.planned) {
    findings.push({
      key: "salary",
      tone: "warn",
      title: "якщо зп буде як найменша з останніх",
      value: m(incomeMin),
      detail: `після розстрочок лишиться ${m(lifeMin)} при лімітах ${m(i.planned)}`,
    });
  }

  // 5. Понад кредитний ліміт — штраф щомісяця
  const overAtPayday = Math.max(0, i.holeAtPayday - i.creditLimit);
  if (i.overLimitNow > 0 || overAtPayday > 0) {
    findings.push({
      key: "over-limit",
      tone: "bad",
      title: "понад кредитний ліміт",
      value: m(Math.max(i.overLimitNow, overAtPayday)),
      detail: `зараз ${m(i.overLimitNow)}, до зп ≈ ${m(overAtPayday)}; штраф щомісяця${i.overLimitFees12m ? `, за рік уже ${m(i.overLimitFees12m)}` : ""} — повернути в ліміт першим`,
    });
  }

  return { findings, incomeAvg, incomeMin, atLimits: atLimits.cycles, atTrend: atTrend.cycles, freeAtTrend };
}
