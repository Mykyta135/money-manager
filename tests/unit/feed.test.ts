import { describe, expect, it } from "vitest";
import { dayTitle, groupByDay, guessCategory, INSTALLMENTS, shortAccountName } from "@/lib/feed";
import { pace } from "@/lib/pace";

const at = (day: number, hour = 12) => Math.floor(new Date(2026, 10, day, hour).getTime() / 1000);
const tx = (id: string, day: number, uah: number, category = "Продукти", isTransfer = false) => ({
  id,
  time: at(day),
  amount: uah * 100,
  category,
  isTransfer,
  description: id,
  accountId: "mono:1",
});

describe("pace", () => {
  const from = new Date(2026, 10, 9);
  const to = new Date(2026, 11, 9);
  const at = (d: number) => new Date(2026, 10, d, 12);

  it("перші дні — без вердикту", () => {
    expect(pace({ spent: 500_000, limit: 2_000_000, from, to, now: at(10) }).verdict).toBe("early");
  });
  it("половина бюджету за половину циклу — в темпі", () => {
    expect(pace({ spent: 1_000_000, limit: 2_000_000, from, to, now: at(24) }).verdict).toBe("ok");
  });
  it("80% бюджету за третину циклу — швидше за план, прогноз у мінус", () => {
    const p = pace({ spent: 1_600_000, limit: 2_000_000, from, to, now: at(19) });
    expect(p.verdict).toBe("over");
    expect(p.projectedLeft).toBeLessThan(0);
  });
  it("ліміт уже пробито — over навіть у перші дні", () => {
    expect(pace({ spent: 2_100_000, limit: 2_000_000, from, to, now: at(10) }).verdict).toBe("over");
  });
  it("витрачаю повільніше — under", () => {
    expect(pace({ spent: 200_000, limit: 2_000_000, from, to, now: at(24) }).verdict).toBe("under");
  });
});

describe("groupByDay", () => {
  it("групує по днях, рахує витрати без переказів, згортає розстрочки дня", () => {
    const days = groupByDay([
      tx("a", 3, -100),
      tx("p1", 2, -250, INSTALLMENTS),
      tx("p2", 2, -80, INSTALLMENTS),
      tx("t", 2, -1000, "Перекази", true),
      tx("b", 2, -50),
    ]);
    expect(days.map((d) => d.key)).toEqual(["2026-11-03", "2026-11-02"]);
    expect(days[1].spent).toBe(38_000);
    const inst = days[1].items.find((i) => i.kind === "installments");
    expect(inst && inst.kind === "installments" && inst.items.length).toBe(2);
    expect(days[1].items).toHaveLength(3);
  });
  it("одна розстрочка за день — звичайний рядок", () => {
    expect(groupByDay([tx("p", 2, -250, INSTALLMENTS)])[0].items[0].kind).toBe("tx");
  });
});

describe("dayTitle", () => {
  const now = new Date(2026, 10, 3, 15);
  it("сьогодні / вчора / дата", () => {
    expect(dayTitle(new Date(2026, 10, 3), now)).toBe("сьогодні");
    expect(dayTitle(new Date(2026, 10, 2), now)).toBe("вчора");
    expect(dayTitle(new Date(2026, 9, 20), now)).toContain("жовтня");
  });
});

describe("shortAccountName", () => {
  const ukrsib = { id: "ukrsib:1", bank: "ukrsib", name: "Укрсиб ЗП ALL INCLUSIVE DE LUXE …8765", currency: "UAH" };
  const black = { id: "mono:b", bank: "mono", name: "Моно black UAH 4321", type: "black", currency: "UAH" };
  const usd = { id: "mono:u", bank: "mono", name: "Моно black USD 4321", type: "black", currency: "USD" };
  it("коротко", () => {
    expect(shortAccountName(ukrsib)).toBe("укрсиб зп");
    expect(shortAccountName(black)).toBe("моно black");
    expect(shortAccountName(usd)).toBe("моно black usd");
    expect(shortAccountName({ id: "cash:main", bank: "cash", name: "Готівка", currency: "UAH" })).toBe("готівка");
  });
  it("двійники розрізняються цифрами", () => {
    const b2 = { ...black, id: "mono:b2", name: "Моно black UAH 4242" };
    expect(shortAccountName(black, [black, b2])).toBe("моно black ·4321");
  });
});

describe("guessCategory", () => {
  const allowed = ["Продукти", "Перекуси й напої", "Кафе"];
  const hist = (cat: string, hour: number, n: number) => Array.from({ length: n }, (_, i) => ({ time: at(1 + i, hour), category: cat, amount: -100 }));
  it("найчастіша категорія в цю годину", () => {
    expect(guessCategory([...hist("Перекуси й напої", 13, 5), ...hist("Продукти", 19, 8)], allowed, new Date(2026, 10, 20, 12))).toBe("Перекуси й напої");
  });
  it("мало даних — остання використана", () => {
    expect(guessCategory(hist("Продукти", 12, 1), allowed, new Date(2026, 10, 20, 12), "Кафе")).toBe("Кафе");
  });
});
