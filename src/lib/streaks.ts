// Серії (гейміфікація): рахуємо тільки утримання й відкладання, ніколи витрати.
// Чиста логіка — для телефона й тестів.

/**
 * Скільки днів поспіль (від найсвіжішого) виконано умову. Один пропуск на кожні 7 днів
 * «заморожується» — щоб один зрив не обнуляв усю серію.
 * days[0] — найсвіжіший день.
 */
export function streak(okDays: boolean[], freezePerWeek = 1) {
  let count = 0;
  let missesUsed = 0;
  for (const ok of okDays) {
    if (ok) {
      count++;
      continue;
    }
    const allowed = Math.floor((count + missesUsed + 1) / 7) * freezePerWeek;
    if (missesUsed < allowed) {
      missesUsed++;
      continue;
    }
    break;
  }
  return { days: count, freezesUsed: missesUsed };
}

/** Рубежі, за які варто похвалити */
export const MILESTONES = [3, 7, 14, 30, 60, 100];

export function reachedMilestone(prev: number, now: number) {
  return MILESTONES.find((m) => prev < m && now >= m) ?? null;
}
