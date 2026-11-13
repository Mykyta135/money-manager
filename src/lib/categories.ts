// Грубе мапування MCC → категорія. Доповнюватимемо, коли побачимо реальні дані.
const MCC_RANGES: [number, number, string][] = [
  [3000, 3999, "Подорожі"],
  [4011, 4131, "Транспорт"],
  [4111, 4111, "Транспорт"],
  [4121, 4121, "Таксі"],
  [4814, 4816, "Зв'язок та інтернет"],
  [4899, 4899, "Підписки"],
  [4900, 4900, "Комуналка"],
  [5200, 5299, "Дім"],
  [5300, 5399, "Супермаркети"],
  [5411, 5499, "Продукти"],
  [5541, 5542, "Пальне"],
  [5600, 5699, "Одяг"],
  [5732, 5735, "Техніка"],
  [5811, 5814, "Кафе та ресторани"],
  [5815, 5818, "Підписки"],
  [5912, 5912, "Аптеки"],
  [5921, 5921, "Алкоголь"],
  [5993, 5993, "Тютюн"],
  [5945, 5945, "Ігри"],
  [6011, 6011, "Готівка"],
  [6012, 6012, "Фінансові послуги"],
  [6538, 6538, "Перекази"],
  [4829, 4829, "Перекази"],
  [7832, 7841, "Розваги"],
  [7991, 7999, "Розваги"],
  [8011, 8099, "Здоров'я"],
  [8211, 8299, "Освіта"],
  [9311, 9311, "Податки"],
];

export function categoryFromMcc(mcc: number | null | undefined): string | null {
  if (!mcc) return null;
  // Точніші діапазони перевіряємо першими
  const match = MCC_RANGES.filter(([a, b]) => mcc >= a && mcc <= b).sort(
    (x, y) => x[1] - x[0] - (y[1] - y[0]),
  )[0];
  return match?.[2] ?? null;
}

// Банківські операції — важливіші за MCC
const OPERATION_KEYWORDS: [RegExp, string][] = [
  [/заборгованост/i, "Овердрафт"],
  [/pumb direct|^(щомісячний )?платіж |^повернення платежу/i, "Платежі по кредитах"],
  [/^розстрочка на картку|кредит до завтра|^погашення кредит/i, "Позики"],
  [/видача готівки|зняття готівки/i, "Готівка"],
  // Магазин біля дому (бутерброди, бургери, енергетики, вода, насіння, кава) — важливіше за MCC продуктового
  [/\bsimi\b|simi ?m|sim ?23|сімі/i, "Перекуси й напої"],
  [/відсот|процент|комісі|перевищення кредитного ліміту/i, "Комісії та відсотки"],
  [/зарплат|заробітн|винагород|salary/i, "Зарплата"],
  [/кешбек|cashback/i, "Кешбек"],
];

// Мерчанти без MCC (виписка Укрсибу) — шукаємо по назві
const MERCHANT_KEYWORDS: [RegExp, string][] = [
  [/silpo|atb|blyzenko|smmark|novus|varus|fora|auchan|metro|avrora|mahazyn|magazyn|magazin|market|rybi|moreryby|rukavychka/i, "Продукти"],
  [/pekarn|pizza|sushi|kebab|cafe|kafe|coffee|kava|restoran|mcdonald|kfc|puzata|khinkal|burger|stumari|glovo|odzhahi/i, "Кафе та ресторани"],
  [/napoi|kolektsiia nap|alko|vino|wine/i, "Алкоголь"],
  [/fitnes|gym|sport/i, "Спорт"],
  [/portmone|easypay|ipay/i, "Платежі"],
  [/pivo|piva|pab|pub|druh|bar\b/i, "Бари"],
  [/bolt|uklon|uber/i, "Таксі"],
  [/lvivavtodor|transport|uz gov|ukrzaliz/i, "Транспорт"],
  [/busfor|infobus|regiojet|flix ?se|flixbus|airline|ryanair|wizz|booking/i, "Подорожі"],
  [/vodafo|kyivstar|lifecell/i, "Зв'язок та інтернет"],
  [/anthropic|claude|openai|chatgpt|youtube|google|duolingo|tinder|telegram|netflix|spotify|apple\.com|megogo|dine4fit/i, "Підписки"],
  [/apteka|pharm|podorozhnyk|anc\b/i, "Аптеки"],
  [/napoyi|tiut|tobac/i, "Тютюн"],
  [/epit?(s|c)entr|leroy|jysk/i, "Дім"],
  [/lc waikiki|lpp|zara|h&m|reserved|sinsay|intempo|answear/i, "Одяг"],
  [/rozetka|prom\.ua|allo|foxtrot|comfy|nova ?posh/i, "Онлайн-покупки"],
];

const TRANSFER = /переказ|поповнення|зарахування|перерахування|p2p/i;

/**
 * Особисті правила (номери власних карток тощо) не лежать у git: JSON-масив
 * `[{"pattern": "<regex>", "category": "<категорія>"}]` у змінній оточення —
 * PERSONAL_CATEGORY_RULES для веба й скриптів (.env.local),
 * EXPO_PUBLIC_PERSONAL_CATEGORY_RULES для телефона (mobile/.env). Мають пріоритет
 * над усіма вбудованими правилами. Зіпсований JSON або regex просто ігнорується.
 */
let personalCache: { raw: string | undefined; rules: [RegExp, string][] } | undefined;

export function personalRules(): [RegExp, string][] {
  const raw = process.env.EXPO_PUBLIC_PERSONAL_CATEGORY_RULES ?? process.env.PERSONAL_CATEGORY_RULES;
  if (personalCache && personalCache.raw === raw) return personalCache.rules;
  let rules: [RegExp, string][] = [];
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      rules = parsed.flatMap((r): [RegExp, string][] => {
        if (typeof r?.pattern !== "string" || typeof r?.category !== "string") return [];
        try {
          return [[new RegExp(r.pattern, "i"), r.category]];
        } catch {
          return [];
        }
      });
    }
  } catch {
    rules = [];
  }
  personalCache = { raw, rules };
  return rules;
}

export function categorize(mcc: number | null | undefined, description: string): string {
  const text = description.toLowerCase();
  return (
    personalRules().find(([re]) => re.test(text))?.[1] ??
    OPERATION_KEYWORDS.find(([re]) => re.test(text))?.[1] ??
    categoryFromMcc(mcc) ??
    (TRANSFER.test(text) ? "Перекази" : null) ??
    MERCHANT_KEYWORDS.find(([re]) => re.test(text))?.[1] ??
    "Інше"
  );
}

const CURRENCIES: Record<number, string> = {
  980: "UAH",
  840: "USD",
  978: "EUR",
  985: "PLN",
  826: "GBP",
};

export function currencyFromCode(code: number): string {
  return CURRENCIES[code] ?? String(code);
}
