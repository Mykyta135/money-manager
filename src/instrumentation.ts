// Поки сервер запущений — фоново підтягуємо моно кожні MONO_SYNC_HOURS годин.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const token = process.env.MONO_TOKEN;
  if (!token) return;

  const g = globalThis as unknown as { __monoTimer?: NodeJS.Timeout };
  if (g.__monoTimer) return;

  const { syncMono } = await import("@/lib/mono/sync");
  const run = () =>
    syncMono({
      token,
      backfillDays: Number(process.env.MONO_BACKFILL_DAYS ?? 365),
      log: (m) => console.log(`[mono] ${m}`),
    }).catch((e) => console.error("[mono] помилка синхронізації:", e));

  const hours = Number(process.env.MONO_SYNC_HOURS ?? 6);
  g.__monoTimer = setInterval(run, hours * 3_600_000);
  setTimeout(run, 5_000);
}
