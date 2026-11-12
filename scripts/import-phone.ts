// Підтягнути бекап з телефона в базу Mac (дзеркало для аналітики): npm run import:phone -- groshi-backup-....json
import { readFileSync } from "node:fs";
import { importPhoneSnapshot } from "@/lib/snapshot";

const file = process.argv[2];
if (!file) {
  console.error("Вкажи файл: npm run import:phone -- groshi-backup-....json");
  process.exit(1);
}
const r = importPhoneSnapshot(JSON.parse(readFileSync(file, "utf8")));
console.log(`нових операцій ${r.added}, розстрочок ${r.loans}, бюджетів ${r.budgets}, переказів між своїми ${r.transfers}`);
