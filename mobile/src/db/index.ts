import { openDatabaseSync } from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import * as schema from "@/db/schema";
import { MIGRATIONS } from "./ddl";
import * as local from "./local";

// Одна база на процес: і для UI, і для фонової задачі
const sqlite = openDatabaseSync("money.db");

function migrate() {
  const { user_version } = sqlite.getFirstSync<{ user_version: number }>("PRAGMA user_version") ?? { user_version: 0 };
  for (let v = user_version; v < MIGRATIONS.length; v++) {
    sqlite.withTransactionSync(() => {
      for (const stmt of MIGRATIONS[v]) sqlite.execSync(stmt);
      sqlite.execSync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

migrate();

export const db = drizzle(sqlite, { schema: { ...schema, ...local } });
