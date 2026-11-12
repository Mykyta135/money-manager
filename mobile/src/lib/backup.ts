import { cacheDirectory, writeAsStringAsync } from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { snapshot } from "./data";

/** Бекап бази в JSON → системне меню «Поділитися» (Telegram «Збережені», Drive, на Mac) */
export async function shareBackup() {
  const name = `groshi-backup-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
  const uri = `${cacheDirectory}${name}`;
  await writeAsStringAsync(uri, JSON.stringify(snapshot()));
  await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "Бекап «Гроші»" });
  return name;
}
