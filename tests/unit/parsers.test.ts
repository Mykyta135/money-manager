import { describe, expect, it } from "vitest";
import { itemGroup, itemKey, parseReceiptLines } from "@/lib/items";
import { bankOf, parsePush } from "@/lib/pushParse";
import { detectSubscriptions, merchantKey } from "@/lib/subscriptions";

describe("parseReceiptLines (OCR чека)", () => {
  const lines = [
    'ТОВ "СІЛЬПО-ФУД"',
    "Напій енергетичний Non Stop Boost",
    "1 x 31.99   31.99 А",
    "Філе куряче Епікур охолоджене",
    "0.656 x 294.00   192.86 А",
    "Яйця курячі Ясенсвіт С1 10шт 79.99 А",
    "СУМА 304.84",
    "КАРТКА 304.84",
  ];
  const items = parseReceiptLines(lines);

  it("знаходить товари з назвою на окремому рядку й вагою", () => {
    expect(items.map((i) => i.name)).toEqual(["Напій енергетичний Non Stop Boost", "Філе куряче Епікур охолоджене", "Яйця курячі Ясенсвіт С1 10шт"]);
    expect(items[1]).toMatchObject({ qty: 0.656, unitPrice: 29_400, total: 19_286 });
  });
  it("пропускає службові рядки (СУМА, КАРТКА)", () => {
    expect(items).toHaveLength(3);
  });
});

describe("itemGroup", () => {
  it.each([
    ["Яйця курячі Ясенсвіт С1", "Молочне, яйця, протеїн"],
    ["Пакет Сільпо 18кг", "Побут і догляд"],
    ["Сіль кухонна", "Соуси й спеції"],
    ["Енергетик Monster", "Енергетики"],
    ["Чипси Lays", "Перекуси й солодке"],
    ["Філе куряче Епікур", "М'ясо й риба"],
  ])("%s → %s", (name, group) => expect(itemGroup(name)).toBe(group));

  it("itemKey прибирає вагу/об'єм", () => {
    expect(itemKey("Вода Моршинська 1,5л")).toBe(itemKey("Вода Моршинська 0,5л"));
  });
});

describe("parsePush", () => {
  const ev = (pkg: string, title: string, text: string) => ({ pkg, title, text, at: 0, key: "k" });

  it("витрата моно з балансом", () => {
    expect(parsePush(ev("com.ftband.mono", "Сімі маркет", "−87.50 ₴\nБаланс 1 234.56 ₴"))).toEqual({ amount: -8750, merchant: "Сімі маркет", balance: 123456 });
  });
  it("зарахування — дохід", () => {
    expect(parsePush(ev("ua.ukrsibbank", "Зарахування", "41 327,19 грн. Виплата винагороди"))!.amount).toBe(4_132_719);
  });
  it("сповіщення без суми ігнорується", () => {
    expect(parsePush(ev("com.ftband.mono", "Привіт", "Новий кешбек"))).toBeNull();
  });
  it("bankOf за назвою пакета", () => {
    expect(bankOf("com.ftband.mono")).toBe("mono");
    expect(bankOf("com.fuib.android")).toBe("pumb");
    expect(bankOf("org.telegram.messenger")).toBeNull();
  });
});

describe("detectSubscriptions", () => {
  const DAY = 86_400;
  const t0 = Math.floor(new Date(2026, 5, 1).getTime() / 1000);
  const charge = (description: string, uah: number, monthsAgo: number, category = "Підписки") => ({
    description,
    category,
    amount: -uah * 100,
    isTransfer: false,
    time: t0 + (5 - monthsAgo) * 30 * DAY,
  });
  const now = t0 + 5 * 30 * DAY + 5 * DAY;

  it("щомісячне списання → підписка; подорожчання помічено", () => {
    const subs = detectSubscriptions([charge("GoogleYouTubePremium", 120, 3), charge("GoogleYouTubePremium", 120, 2), charge("GoogleYouTubePremium", 120, 1), charge("GoogleYouTubePremium", 179, 0)], now);
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ lastAmount: 17_900, prevAmount: 12_000, increased: true });
  });
  it("обрізана назва банком (vodafo / vodafone) — один мерчант", () => {
    expect(merchantKey("*RPAYVODAFO")).toBe("vodafo");
    const subs = detectSubscriptions([charge("*RPAYVODAFO", 350, 2, "Зв'язок та інтернет"), charge("Vodafone", 350, 1, "Зв'язок та інтернет"), charge("Vodafone", 350, 0, "Зв'язок та інтернет")], now);
    expect(subs).toHaveLength(1);
  });
  it("продукти раз на місяць — не підписка", () => {
    expect(detectSubscriptions([charge("SILPO", 400, 2, "Продукти"), charge("SILPO", 410, 1, "Продукти"), charge("SILPO", 390, 0, "Продукти")], now)).toHaveLength(0);
  });
  it("одне свіже списання в «Підписках» — нова підписка", () => {
    expect(detectSubscriptions([charge("Netflix", 510, 0)], now)[0]).toMatchObject({ charges: 1 });
  });
});
