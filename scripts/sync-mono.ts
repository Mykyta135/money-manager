// Повна синхронізація моно з консолі: npm run sync:mono
// Перший запуск за рік історії триває ~13 хв на рахунок (ліміт 1 запит/хв) — це нормально.
import { syncMono } from "@/lib/mono/sync";

try {
  process.loadEnvFile(".env.local");
} catch {}

const token = process.env.MONO_TOKEN;
if (!token) {
  console.error("Немає MONO_TOKEN у .env.local (див. .env.example)");
  process.exit(1);
}

syncMono({
  token,
  backfillDays: Number(process.env.MONO_BACKFILL_DAYS ?? 365),
  log: (m) => console.log(`[${new Date().toLocaleTimeString("uk-UA")}] ${m}`),
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
