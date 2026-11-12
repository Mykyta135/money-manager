// Розбір тексту пушів банків → сума, мерчант, баланс. Чиста логіка (телефон + тести на Mac).

export type BankPushEvent = { pkg: string; title: string; text: string; at: number; key: string };

const BANK_BY_PKG: [RegExp, "mono" | "ukrsib" | "pumb"][] = [
  [/ftband|monobank|\.mono/i, "mono"],
  [/ukrsib/i, "ukrsib"],
  [/fuib|pumb/i, "pumb"],
];

const MONEY = /([+−-])?\s?(\d[\d\s ]*(?:[.,]\d{1,2})?)\s?(₴|грн|uah)/gi;
const BALANCE = /(баланс|залишок|доступно|доступний|ліміт|кредитні)[^\n.]*/gi;
const INCOME = /зарахування|поповнення|надходження|отримано|отримали|повернення|від:|^\+/i;

export function bankOf(pkg: string) {
  return BANK_BY_PKG.find(([re]) => re.test(pkg))?.[1] ?? null;
}

/** Розбір тексту пушу → сума (копійки, витрата < 0) і мерчант */
export function parsePush(e: BankPushEvent) {
  const full = `${e.title}\n${e.text}`;
  const withoutBalance = full.replace(BALANCE, " ");
  const m = [...withoutBalance.matchAll(MONEY)][0];
  if (!m) return null;

  const value = Math.round(Number(m[2].replace(/[\s ]/g, "").replace(",", ".")) * 100);
  if (!value) return null;
  const income = m[1] === "+" || INCOME.test(full);

  // Мерчант — рядок без суми й балансу; беремо найдовший змістовний шматок
  const parts = withoutBalance
    .split(/\n|·|\||,(?=\s)/)
    .map((p) => p.replace(MONEY, "").replace(/^(оплата|покупка|списання|payment)\s*/i, "").trim())
    .filter((p) => p.length >= 2 && !/^\W+$/.test(p));
  const merchant = parts.sort((a, b) => b.length - a.length)[0] ?? e.title;

  const bal = full.match(/(баланс|залишок|доступно)[^\d−-]{0,20}([−-]?\d[\d\s\u00a0]*(?:[.,]\d{1,2})?)\s?(₴|грн|uah)/i);
  const balance = bal ? Math.round(Number(bal[2].replace(/[\s\u00a0]/g, "").replace(",", ".").replace("−", "-")) * 100) : null;

  return { amount: income ? value : -value, merchant, balance };
}
