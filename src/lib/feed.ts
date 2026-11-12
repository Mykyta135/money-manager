// Стрічка операцій: групи по днях із сумою дня, розстрочки за день згорнуті в один рядок,
// короткі людські назви рахунків, вгадування категорії для ручної витрати.

export const INSTALLMENTS = "Платежі по кредитах";

type FeedTx = { id: string; time: number; amount: number; category: string; isTransfer: boolean; description: string; accountId: string };

export type FeedItem<T extends FeedTx> = { kind: "tx"; tx: T } | { kind: "installments"; id: string; total: number; items: T[] };

export type FeedDay<T extends FeedTx> = { key: string; date: Date; spent: number; items: FeedItem<T>[] };

const dayKey = (d: Date) => d.toLocaleDateString("sv-SE");

/** txs — від найновішої; витрати дня рахуються без переказів між своїми */
export function groupByDay<T extends FeedTx>(txs: T[]): FeedDay<T>[] {
  const days: FeedDay<T>[] = [];
  for (const t of txs) {
    const date = new Date(t.time * 1000);
    const key = dayKey(date);
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      day = { key, date: new Date(date.getFullYear(), date.getMonth(), date.getDate()), spent: 0, items: [] };
      days.push(day);
    }
    if (t.amount < 0 && !t.isTransfer) day.spent -= t.amount;
    if (t.category === INSTALLMENTS && t.amount < 0) {
      const group = day.items.find((i) => i.kind === "installments");
      if (group && group.kind === "installments") {
        group.items.push(t);
        group.total += t.amount;
      } else day.items.push({ kind: "installments", id: `inst:${key}`, total: t.amount, items: [t] });
      continue;
    }
    day.items.push({ kind: "tx", tx: t });
  }
  // одна розстрочка за день — звичайний рядок, згортати нема чого
  for (const d of days) d.items = d.items.map((i) => (i.kind === "installments" && i.items.length === 1 ? { kind: "tx", tx: i.items[0] } : i));
  return days;
}

/** «сьогодні», «вчора», далі «пн, 2 листопада» */
export function dayTitle(date: Date, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((today - date.getTime()) / 86_400_000);
  if (diff === 0) return "сьогодні";
  if (diff === 1) return "вчора";
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("uk-UA", { weekday: "short", day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) });
}

type NamedAccount = { id: string; bank: string; name: string; type?: string | null; currency: string };

/** «Укрсиб ЗП ALL INCLUSIVE DE LUXE …8765» → «укрсиб зп», «Моно black UAH 4321» → «моно black» */
export function shortAccountName(a: NamedAccount, all: NamedAccount[] = [a]) {
  const base = (x: NamedAccount) => {
    const cur = x.currency !== "UAH" ? ` ${x.currency.toLowerCase()}` : "";
    if (x.bank === "cash") return "готівка";
    if (x.bank === "mono") return `моно ${(x.type ?? x.name.split(" ")[1] ?? "").toLowerCase()}`.trim() + cur;
    if (x.bank === "ukrsib") return `укрсиб${/(^|\s)зп(\s|$)/i.test(x.name) ? " зп" : ""}${cur}`;
    if (x.bank === "pumb") return `пумб${cur}`;
    return x.name.toLowerCase();
  };
  const name = base(a);
  // однакові короткі назви — додаємо останні 4 цифри
  const twins = all.filter((x) => base(x) === name).length > 1;
  const digits = a.name.match(/(\d{4})\s*$/)?.[1];
  return twins && digits ? `${name} ·${digits}` : name;
}

/**
 * Категорія для нової ручної витрати: найчастіша серед витрат у схожу годину (±2) за історію,
 * інакше — остання використана, інакше — перша з бюджетів.
 */
export function guessCategory(history: { time: number; category: string; amount: number }[], allowed: string[], now = new Date(), last?: string | null) {
  const h = now.getHours();
  const counts = new Map<string, number>();
  for (const t of history) {
    if (t.amount >= 0 || !allowed.includes(t.category)) continue;
    const th = new Date(t.time * 1000).getHours();
    const dist = Math.min(Math.abs(th - h), 24 - Math.abs(th - h));
    if (dist <= 2) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] >= 3) return best[0];
  if (last && allowed.includes(last)) return last;
  return allowed[0];
}
