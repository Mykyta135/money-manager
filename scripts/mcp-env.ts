// Імпортується першим у mcp-server.ts: модулі виконуються в порядку імпорту,
// тож база відкриється вже з правильним cwd і змінними з .env.local
import path from "node:path";

process.chdir(path.resolve(__dirname, ".."));
try {
  process.loadEnvFile(".env.local");
} catch {}
