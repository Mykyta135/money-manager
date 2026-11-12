import { and, gte, lt } from "drizzle-orm";
import { offers, transactions } from "@/db/schema";
import { formatMoney } from "@/lib/format";
import { db } from "@m/db";
import { reachedMilestone } from "@/lib/streaks";
import { allAccounts, allLoans, currentBudget, paymentDates, picture, streakLines, subscriptions } from "./data";
import { notify } from "./notify";
import { getState, once, setState } from "./state";

// Перевірки, які запускає фонова задача. Кожна спрацьовує не частіше, ніж треба (once).

const ymd = (d: Date) => d.toLocaleDateString("sv-SE");
const dm = (d: Date) => d.toLocaleDateString("uk-UA", { day: "numeric", month: "numeric" });

export async function runChecks(now = new Date()) {
  const today = ymd(now);
  const hour = now.getHours();
  if (hour < 9 || hour >= 22) return; // вночі не турбуємо
  const budget = currentBudget(now);

  // 1. Завтра платежі по розстрочках + чи вистачає власних на black
  const tomorrow = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const due = allLoans().filter((l) => paymentDates(l.startDate, l.termMonths).some((d) => ymd(d) === tomorrow));
  if (due.length) {
    const total = due.reduce((s, l) => s + l.monthlyPayment, 0);
    const black = allAccounts().find((a) => a.id.startsWith("mono:") && a.creditLimit > 0);
    const short = black && black.own < total ? `\nНа black власних ${formatMoney(black.own)} — спишеться з кредитних` : "";
    await once(`due-${tomorrow}`, () => notify("alerts", `Завтра розстрочки: ${formatMoney(total)}`, `${due.map((l) => l.name).join(", ")}${short}`));
  }

  // 2. Вихід за кредитний ліміт → 1 числа буде штраф
  for (const a of allAccounts()) {
    if (a.creditLimit > 0 && (a.balance ?? 0) < 0) {
      await once(`overlimit-${a.id}-${today}`, () =>
        notify("alerts", "Понад кредитний ліміт", `${a.name}: ${formatMoney(-(a.balance ?? 0))} понад ліміт. 1 числа буде штраф — поповни до кінця місяця`),
      );
    }
  }

  // 5. П'ятниця 18:00+ — найдорожчий вечір: скільки лишилось на гуляння + порада з готівкою
  if (now.getDay() === 5 && hour >= 18) {
    const out = budget.budgets.find((b) => b.id === "going-out");
    if (out)
      await once(`friday-${today}`, () =>
        notify("digest", "П'ятниця", `На кафе й бари лишилось ${formatMoney(Math.max(0, out.left))} до ЗП. Порада: візьми ${formatMoney(Math.min(Math.max(0, out.left), 50_000))} готівкою, а картку лиши вдома`),
      );
  }

  // 6. Неділя 19:00+ — підсумок тижня
  if (now.getDay() === 0 && hour >= 19) {
    const weekAgo = Math.floor(now.getTime() / 1000) - 7 * 86_400;
    const spent = db
      .select({ amount: transactions.amount, isTransfer: transactions.isTransfer })
      .from(transactions)
      .where(and(gte(transactions.time, weekAgo), lt(transactions.amount, 0)))
      .all()
      .filter((t) => !t.isTransfer)
      .reduce((s, t) => s - t.amount, 0);
    await once(`weekly-${today}`, () =>
      notify("digest", "Підсумок тижня", `Витрачено ${formatMoney(spent)}. До ЗП: ${formatMoney(budget.totalSpent)} з ${formatMoney(budget.totalLimit)}, на день можна ${formatMoney(budget.safeToday)}`),
    );
  }

  // 7. 1 число — оновити категорії кешбеку моно
  if (now.getDate() === 1) {
    await once(`cashback-${today}`, () => notify("digest", "Новий місяць — кешбек", "Підключи категорії кешбеку в моно і скинь скрін акцій, щоб оновити план"));
  }

  // 8. Акції, які згорають через 3 дні
  const in3 = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3));
  for (const o of db.select().from(offers).all().filter((o) => o.validUntil === in3 && (o.kind === "promo" || o.activated))) {
    await once(`offer-${o.id}-${in3}`, () => notify("digest", "Згорає через 3 дні", o.title));
  }

  // 9. Сторож підписок: нова, подорожчала, списання через 2 дні
  const known = new Set(getState<string[]>("subs:known") ?? []);
  const subs = subscriptions();
  for (const s of subs) {
    if (!known.has(s.key) && known.size > 0) {
      await notify("alerts", "Нова підписка?", `${s.name}: ${formatMoney(s.lastAmount)}/міс. Якщо не потрібна — скасуй до ${dm(new Date(s.nextAt * 1000))}`);
    }
    if (s.increased) {
      await once(`sub-up-${s.key}-${s.lastAmount}`, () =>
        notify("alerts", "Підписка подорожчала", `${s.name}: було ${formatMoney(s.prevAmount)}, стало ${formatMoney(s.lastAmount)}`),
      );
    }
    const inDays = (s.nextAt * 1000 - now.getTime()) / 86_400_000;
    if (inDays > 0 && inDays <= 2) {
      await once(`sub-soon-${s.key}-${ymd(new Date(s.nextAt * 1000))}`, () =>
        notify("digest", `Скоро спише ${s.name}`, `${formatMoney(s.lastAmount)} ~${dm(new Date(s.nextAt * 1000))}. Не користуєшся — встигни скасувати`),
      );
    }
  }
  setState("subs:known", subs.map((s) => s.key));

  // 11. Реальних грошей до ЗП нема — «тільки обов'язкове» (раз на цикл)
  const pic = picture(now);
  if (pic.budget.essentialOnly) {
    await once(`essential-${ymd(pic.budget.from)}`, () =>
      notify("alerts", "Тільки обов'язкове до зп", `Реальних грошей до ${dm(pic.budget.to)} нема. Кафе, перекуси, одяг та інше заморожено; на їжу, дорогу й ліки — до ${formatMoney(pic.essentialDaily)}/день, і це вже в борг`),
    );
  }

  // 10. Серії: похвалити на рубежах (3, 7, 14, 30…) — раз на кожен рубіж, поки серія не обірветься
  const prev = getState<Record<string, number>>("streaks:prev");
  const lines = streakLines();
  for (const x of prev ? lines : []) {
    const m = reachedMilestone(prev![x.key] ?? 0, x.days);
    if (m) await notify("digest", "Серія", x.label);
  }
  setState("streaks:prev", Object.fromEntries(lines.map((x) => [x.key, x.days])));
}
