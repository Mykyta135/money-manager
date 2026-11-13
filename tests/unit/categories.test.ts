import { afterEach, describe, expect, it, vi } from "vitest";
import { categorize, categoryFromMcc } from "@/lib/categories";

describe("personal rules from the environment", () => {
  afterEach(() => vi.unstubAllEnvs());
  const lunch = "Переказ грошових коштів з картки на картку 555555****1234 в UKRSIB online";

  it("apply first, so own card numbers never live in the code", () => {
    vi.stubEnv("PERSONAL_CATEGORY_RULES", JSON.stringify([{ pattern: "555555\\*{4}1234", category: "Обіди на роботі" }]));
    expect(categorize(null, lunch)).toBe("Обіди на роботі");
  });

  it("phone variable wins over the web one", () => {
    vi.stubEnv("PERSONAL_CATEGORY_RULES", JSON.stringify([{ pattern: "555555", category: "A" }]));
    vi.stubEnv("EXPO_PUBLIC_PERSONAL_CATEGORY_RULES", JSON.stringify([{ pattern: "555555", category: "B" }]));
    expect(categorize(null, lunch)).toBe("B");
  });

  it("ignores broken JSON and broken regexes", () => {
    vi.stubEnv("PERSONAL_CATEGORY_RULES", "{not json");
    expect(categorize(null, lunch)).toBe("Перекази");
    vi.stubEnv("PERSONAL_CATEGORY_RULES", JSON.stringify([{ pattern: "(", category: "X" }, { pattern: 5 }]));
    expect(categorize(null, lunch)).toBe("Перекази");
  });
});

describe("categorize", () => {
  it.each([
    [null, "SIMI MARKET #3", "Перекуси й напої"],
    [5411, "Сімі маркет", "Перекуси й напої"], // магазин біля дому важливіший за MCC
    [null, "*ANTHROPIC CLA", "Підписки"],
    [null, "Netflix", "Підписки"], // не FlixBus
    [null, "Flix SE", "Подорожі"],
    [null, "GoogleDine4Fit", "Підписки"],
    [5499, "Видача готівки АТБ", "Готівка"],
    [null, "Переказ ... PUMB DIRECT : Google Pay ****1234.", "Платежі по кредитах"],
    [4829, "Щомісячний платіж TOV Komerts", "Платежі по кредитах"],
    [4829, "Розстрочка на картку", "Позики"],
    [null, "Переказ грошових коштів з картки на картку 555555****1234 в UKRSIB online", "Перекази"], // без особистих правил
    [null, 'Виплата винагороди за гіг-контрактом від ТОВ "Кевич"', "Зарплата"],
    [null, "Комісія за переказ грошових коштів", "Комісії та відсотки"],
    [6012, "За перевищення кредитного ліміту", "Комісії та відсотки"],
    [null, "Погашення заборгованості, яка не передбачена Договором", "Овердрафт"],
    [5812, "Паб «Добрий Друг» 6", "Кафе та ресторани"],
  ])("%s %s → %s", (mcc, description, expected) => {
    expect(categorize(mcc, description)).toBe(expected);
  });

  it("найвужчий діапазон MCC перемагає", () => {
    expect(categoryFromMcc(4121)).toBe("Таксі");
  });
});
