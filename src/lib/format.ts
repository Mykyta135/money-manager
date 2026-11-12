const money = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 });

/** Копійки → "12 345 ₴" */
export function formatMoney(minor: number, currency = "UAH") {
  const symbol = currency === "UAH" ? "₴" : currency;
  return `${money.format(minor / 100)} ${symbol}`;
}

export function formatDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatPercent(x: number) {
  return `${(x * 100).toFixed(1)}%`;
}

/** "1 234,56" / "1234.56" → копійки */
export function parseMoney(input: string): number {
  const n = Number(input.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n)) throw new Error(`Не схоже на суму: ${input}`);
  return Math.round(n * 100);
}
