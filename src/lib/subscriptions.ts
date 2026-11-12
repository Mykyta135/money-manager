// Пошук регулярних платежів (підписки, зв'язок) серед витрат: той самий мерчант
// раз на ~місяць зі схожою сумою. Чиста логіка — для Mac і для телефона.

export type SubTx = { time: number; amount: number; description: string; category: string; isTransfer: boolean };

export type Subscription = {
  key: string;
  name: string;
  lastAmount: number; // копійки, додатне
  prevAmount: number;
  lastAt: number; // unix s
  nextAt: number; // очікуване наступне списання, unix s
  charges: number;
  increased: boolean;
};

// Часті «звичайні» витрати — не підписки, навіть якщо раз на місяць
const NOT_SUBS = new Set([
  "Продукти", "Супермаркети", "Перекуси й напої", "Кафе та ресторани", "Бари", "Таксі", "Транспорт",
  "Перекази", "Платежі по кредитах", "Готівка", "Позики", "Обіди на роботі", "Овердрафт", "Комісії та відсотки",
]);

const DAY = 86_400;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

export function merchantKey(description: string) {
  return description
    .toLowerCase()
    .replace(/ ?: .*$/, "") // хвіст гаманця: " : M4M ****1234"
    .replace(/^[*\s]*(rpay|liqpay|ipay|portmone)?[.\s]*/, "")
    .replace(/[^a-zа-яіїєґ]+/g, "")
    .slice(0, 24);
}

// Агрегатори: під ними різні сервіси, тож за префіксом їх не зливаємо
const AGGREGATORS = new Set(["google", "apple", "applecom", "paypal"]);

/** "vodafo" і "vodafone" — один мерчант, просто обрізаний банком */
function mergeByPrefix(groups: Map<string, SubTx[]>) {
  const keys = [...groups.keys()].sort((a, b) => a.length - b.length);
  for (const short of keys) {
    if (short.length < 6 || AGGREGATORS.has(short) || !groups.has(short)) continue;
    const long = keys.find((k) => k !== short && k.startsWith(short) && groups.has(k));
    if (!long) continue;
    groups.set(long, [...groups.get(long)!, ...groups.get(short)!]);
    groups.delete(short);
  }
}

export function detectSubscriptions(txs: SubTx[], now = Date.now() / 1000): Subscription[] {
  const groups = new Map<string, SubTx[]>();
  for (const t of txs) {
    if (t.amount >= 0 || t.isTransfer || NOT_SUBS.has(t.category)) continue;
    const key = merchantKey(t.description);
    if (key.length < 3) continue;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  mergeByPrefix(groups);

  const subs: Subscription[] = [];
  for (const [key, list] of groups) {
    const sorted = list.sort((a, b) => a.time - b.time);
    const last = sorted.at(-1)!;
    // Одне свіже списання в «Підписках» — схоже на нову підписку (напр. Netflix)
    if (sorted.length === 1) {
      if (last.category === "Підписки" && now - last.time < 40 * DAY) {
        const amount = -last.amount;
        subs.push({ key, name: last.description, lastAmount: amount, prevAmount: amount, lastAt: last.time, nextAt: last.time + 30 * DAY, charges: 1, increased: false });
      }
      continue;
    }
    const gaps = sorted.slice(1).map((t, i) => (t.time - sorted[i].time) / DAY);
    const gap = median(gaps);
    if (gap < 24 || gap > 40) continue; // не щомісячне (банк іноді списує на день-два пізніше)

    const amounts = sorted.map((t) => -t.amount);
    const lastAmount = -last.amount;
    const typical = median(amounts.slice(0, -1));
    if (Math.abs(lastAmount - typical) > typical * 0.5) continue; // суми надто різні — не підписка
    if (now - last.time > gap * 1.8 * DAY) continue; // вже давно не списується — відмінена

    subs.push({
      key,
      name: last.description,
      lastAmount,
      prevAmount: amounts.at(-2)!,
      lastAt: last.time,
      nextAt: Math.round(last.time + gap * DAY),
      charges: sorted.length,
      increased: lastAmount > amounts.at(-2)! * 1.03,
    });
  }
  return subs.sort((a, b) => b.lastAmount - a.lastAmount);
}
