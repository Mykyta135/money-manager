// Дизайн-токени — єдине джерело кольорів, відступів, радіусів, шрифтів і глибини.
// Без React Native імпортів: їх бере і апка (ui.tsx), і віджет на робочому столі.

/** Кольори. Колір — тільки стани (норм / увага / перевитрата) і золото для відкладеного й серій */
export const C = {
  bg: "#0b0b0a",
  surface: "#151513", // рівень 1 — блоки
  raised: "#1b1a18", // рівень 2 — hero, таб-бар, шторка
  overlay: "#22211e", // рівень 3 — тост
  line: "#2a2926",
  text: "#f2f1ed",
  muted: "#8c8a82",
  faint: "#7d7b74", // ≥4.5:1 до фону — плейсхолдери й неактивне мають читатись
  ripple: "rgba(242,241,237,0.08)",
  bad: "#e5534b",
  ok: "#6cc49a",
  warn: "#e3a548",
  gold: "#d9b45f",
} as const;

/** Відступи — сітка 4pt. Інших чисел у стилях бути не повинно */
export const S = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Поле екрана й внутрішній відступ блоку */
export const GUTTER = S.lg;

export const R = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

/** Шрифти: підпис, дрібний, основний, введення, заголовок, нумпад, головне число */
export const T = { micro: 11, caption: 12, small: 13, body: 15, input: 17, title: 22, numpad: 26, display: 56 } as const;

/**
 * Глибина. На темному тінь сама майже не видна, тому вищий рівень = світліша поверхня
 * + тінь під нею + тонкий світлий кант зверху (як світло, що падає згори).
 */
export const E = {
  1: { backgroundColor: C.surface, boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.04), 0 6px 18px -6px rgba(0,0,0,0.8)" },
  2: { backgroundColor: C.raised, boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.05), 0 10px 30px -8px rgba(0,0,0,0.9)" },
  3: { backgroundColor: C.overlay, boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.06), 0 16px 40px -10px rgba(0,0,0,0.95)" },
} as const;

/** Тривалість анімацій, мс */
export const MOTION = { fast: 140, base: 200, toast: 3500 } as const;
