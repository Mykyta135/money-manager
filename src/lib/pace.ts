// Темп витрат: чи гроші йдуть швидше, ніж минає цикл (spent% / elapsed%).
// Допуск ±15 п.п.; перші дні циклу вердикту нема — одна покупка ще нічого не означає.

const DAY_MS = 86_400_000;
export const PACE_TOLERANCE = 0.15;
const MIN_DAYS = 3;

export type PaceVerdict = "early" | "under" | "ok" | "over";

export type Pace = {
  timePct: number; // 0…1 — скільки циклу минуло
  spentPct: number; // 0…∞ — скільки бюджету витрачено
  verdict: PaceVerdict;
  projected: number; // скільки буде витрачено на кінець циклу в такому темпі, копійки
  projectedLeft: number; // ліміт − прогноз (мінус — не вистачить)
};

export function pace(o: { spent: number; limit: number; from: Date; to: Date; now: Date }): Pace {
  const total = Math.max(1, o.to.getTime() - o.from.getTime());
  const elapsed = Math.min(total, Math.max(0, o.now.getTime() - o.from.getTime()));
  const timePct = elapsed / total;
  const spentPct = o.limit > 0 ? o.spent / o.limit : o.spent > 0 ? Infinity : 0;
  const projected = timePct > 0 ? Math.round(o.spent / timePct) : o.spent;

  let verdict: PaceVerdict;
  if (o.spent > o.limit) verdict = "over"; // ліміт уже пробито — чекати нема чого
  else if (elapsed < MIN_DAYS * DAY_MS) verdict = "early";
  else if (spentPct - timePct > PACE_TOLERANCE) verdict = "over";
  else if (timePct - spentPct > PACE_TOLERANCE) verdict = "under";
  else verdict = "ok";

  return { timePct, spentPct, verdict, projected, projectedLeft: o.limit - projected };
}
