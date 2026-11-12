import type { NewTransaction } from "@/db/schema";
import { budgetFor } from "@/lib/budget";
import { ESSENTIAL_BUDGETS } from "@/lib/reality";
import { formatMoney } from "@/lib/format";
import { currentBudget, picture, recordSalary } from "./data";
import { notify } from "./notify";
import { updateWidget } from "@m/widget/update";

const money = (v: number) => formatMoney(v).replace(" ₴", "");
const dayMonth = (d: Date) => d.toLocaleDateString("uk-UA", { day: "numeric", month: "numeric" });

/** Реакція на нові операції — однакова для синку моно, пушів банків і ручного додавання */
export async function reactToNew(txs: NewTransaction[]) {
  for (const t of [...txs].sort((a, b) => a.time - b.time)) {
    if (t.isTransfer) continue;

    if (t.amount > 0) {
      if (t.category === "Зарплата") await paydayPlan(t.amount, t.time * 1000);
      else if (t.amount >= 1_000_000) await notify("alerts", `+${formatMoney(t.amount)}`, t.description ?? "");
      continue;
    }

    if (t.category === "Готівка") {
      await notify("spend", `Знято ${formatMoney(-t.amount)} готівкою`, "Додай, на що витрачаєш: віджет → «+ Витрата» → Готівка. Інакше ці гроші випадуть з бюджету");
      continue;
    }

    const pic = picture();
    const summary = pic.budget;
    const b = budgetFor(summary, t.category!);
    const line = b ? `${b.name.toLowerCase()} ${money(b.spent)} / ${money(b.limitUah)}${b.left < 0 ? " · перевитрата" : ""}` : t.category!.toLowerCase();
    const commission = t.commission ? ` · комісія ${formatMoney(t.commission)}` : "";
    const frozen = summary.essentialOnly && b && !ESSENTIAL_BUDGETS.has(b.id) ? "\nзараз тільки обов'язкове — це вже в борг" : "";
    await notify("spend", `${formatMoney(t.amount)} · ${t.description}`, `${line}${commission}${frozen}\nсьогодні ще ${formatMoney(pic.safe)}${splurgeHint(-t.amount, summary)}`);
  }
  updateWidget();
}

/**
 * Зрив: покупка більша за денний ліміт → пояснити, як це вплинуло на наступні дні
 * і з якої категорії найлегше компенсувати.
 */
function splurgeHint(spent: number, b: ReturnType<typeof currentBudget>) {
  const perDayBefore = b.safeToday + Math.floor(spent / b.daysLeft);
  // коли ліміт уже 0, порівнювати «0 замість 15» безглуздо
  if (spent <= perDayBefore || b.daysLeft <= 1 || b.safeToday === 0) return "";
  const spare = [...b.budgets].filter((x) => x.left > 0).sort((x, y) => y.left - x.left)[0];
  return `\nдалі по ${formatMoney(b.safeToday)}/день замість ${formatMoney(perDayBefore)}${spare ? ` · запас є в «${spare.name.toLowerCase()}»` : ""}`;
}

/** Прийшла ЗП → план: розстрочки, життя, мінус (якщо є), відкладання */
export async function paydayPlan(amount: number, at: number) {
  recordSalary(amount, at);
  const c = currentBudget();
  const lines = [
    `→ ${formatMoney(c.loans)} розстрочки до ${dayMonth(c.to)}`,
    c.shortfall > 0 ? `Бракує ${formatMoney(c.shortfall)} навіть на розстрочки — переглянь бюджет` : `→ ${formatMoney(c.life)} на життя ≈ ${formatMoney(Math.floor(c.life / c.daysLeft))}/день`,
  ];
  if (c.debt > 0) lines.push(`→ ${formatMoney(c.paydown)} закрити мінус${c.debtAfter > 0 ? ` (лишиться ${formatMoney(c.debtAfter)})` : ""}`);
  lines.push(c.savings > 0 ? `→ ${formatMoney(c.savings)} відкласти` : `Відкладання ${formatMoney(c.savingsTarget)} — коли закриєш мінус`);
  if (c.scale < 1) lines.push(`Ліміти урізано до ${Math.round(c.scale * 100)}%, бо ЗП менша за план`);
  if (c.surplus > 0) lines.push(`Понад план лишається ${formatMoney(c.surplus)} — можна докласти в банку`);
  await notify("alerts", `Прийшла зп ${formatMoney(amount)}`, lines.join("\n"));
}
