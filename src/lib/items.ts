// Товари з чеків: розбір рядків OCR і групи («що саме купую»). Чиста логіка — для Mac і телефона.

export type ParsedItem = { name: string; qty: number; unitPrice: number; total: number }; // копійки

const GROUPS: [RegExp, string][] = [
  [/енерг|non ?stop|monster|burn|red ?bull|битий|bullit|pit ?bull/i, "Енергетики"],
  [/пиво|вино|горілк|віскі|коньяк|сидр|ром\b|джин|beer|wine/i, "Алкоголь"],
  [/сигарет|стік|heets|terea|iqos|тютюн|glo\b/i, "Тютюн"],
  [/пакет|серветк|папір|мило|шампун|дезодор|зубн|порош|губк|засіб|прокладк|бритв/i, "Побут і догляд"],
  [/кола|cola|pepsi|спрайт|sprite|фанта|fanta|сік|нектар|живчик|вода|лимонад|чай холодн|напій/i, "Напої"],
  [/чипс|насіння|семечк|сухар|снек|шоколад|батончик|цукерк|печиво|вафл|морозив|круасан|донат|kinder|snickers|mars|twix/i, "Перекуси й солодке"],
  [/бутерброд|сендвіч|сэндвіч|бургер|хот.?дог|шаурм|піц|салат|гриль|котлет|каша|смажен|рис з|суп|бограч|солянк|борщ|кулінар/i, "Готова їжа"],
  [/кава|coffee|капучин|лате|американо|еспресо/i, "Кава"],
  [/яйц|молок|кефір|йогурт|сир\b|сир |творог|сметан|масло верш|ряжанк|protein|протеїн/i, "Молочне, яйця, протеїн"],
  [/філе|курк|кур[яи]ч|стегн|гомілк|свинин|ялович|фарш|індич|ковбас|сосиск|тунець|риб|хек|минтай|лосось|скумбр/i, "М'ясо й риба"],
  [/хліб|батон|лаваш|булк|багет/i, "Хліб"],
  [/круп|рис\b|гречк|вівсян|пластівц|макарон|спагет|сочевиц|квасол|горох|нут|борошн/i, "Крупи й бобові"],
  [/банан|яблук|апельсин|мандарин|лимон|лохин|ягід|овоч|огір|помідор|томат|картопл|цибул|морква|капуст|перець|авокадо|кеш'ю|горіх|мигдал/i, "Фрукти, овочі, горіхи"],
  [/приправ|спеці|кориц|каррі|куркум|соус|кетчуп|майонез|олі[яї]|(^|\s)сіль(\s|$)|цукор|оцет/i, "Соуси й спеції"],
];

export function itemGroup(name: string) {
  return GROUPS.find(([re]) => re.test(name))?.[1] ?? "Інше";
}

/** Назва без ваги/об'єму/марки-шуму — щоб порівнювати той самий товар між чеками */
export function itemKey(name: string) {
  return name
    .toLowerCase()
    .replace(/\d+([.,]\d+)?\s*(кг|г|гр|л|мл|шт|%)/g, " ")
    .replace(/[^a-zа-яіїєґ' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

const SKIP = /сума|всього|разом|до сплати|пдв|податок|готівк|картк|решта|здача|чек\b|фн\b|зн\b|пн\b|ід\b|дата|касир|оплат|безготів|термінал|rrn|auth|код|тов\b|фоп\b|адрес|вул\.|знижк|бонус|дякуємо|фіскальн/i;
const PRICE_END = /(-?\d{1,6}[.,]\d{2})\s*[АБВГДЕA-Z*]?\s*$/;
const QTY_X_PRICE = /(\d+(?:[.,]\d{1,3})?)\s*[xх*×]\s*(\d{1,6}[.,]\d{2})/i;

const toKop = (s: string) => Math.round(Number(s.replace(",", ".")) * 100);

/** Рядки з OCR (expo-text-extractor) → товари. Евристика під формати чеків ПРРО */
export function parseReceiptLines(lines: string[]): ParsedItem[] {
  const items: ParsedItem[] = [];
  let pendingName: string | null = null;

  for (const raw of lines.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean)) {
    if (SKIP.test(raw)) {
      pendingName = null;
      continue;
    }
    const qx = raw.match(QTY_X_PRICE);
    const end = raw.match(PRICE_END);

    if (!end) {
      // Рядок без ціни — скоріше назва, ціна буде в наступному рядку
      if (/[a-zа-яіїєґ]{3,}/i.test(raw)) pendingName = raw;
      continue;
    }

    const total = toKop(end[1]);
    const textPart = raw.slice(0, raw.length - end[0].length).replace(QTY_X_PRICE, "").trim();
    const name = /[a-zа-яіїєґ]{3,}/i.test(textPart) ? textPart : pendingName;
    pendingName = null;
    if (!name || total <= 0) continue;

    const qty = qx ? Number(qx[1].replace(",", ".")) : 1;
    const unitPrice = qx ? toKop(qx[2]) : total;
    items.push({ name, qty, unitPrice, total });
  }
  return items;
}
