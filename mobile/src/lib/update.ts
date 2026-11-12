import * as Application from "expo-application";
import { File, Paths } from "expo-file-system";
import { getContentUriAsync } from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { create } from "zustand";
import { getState } from "./state";

// Самооновлення: Mac роздає mobile/dist (npm run apk:publish пише туди latest.json),
// апка при відкритті питає, чи є новіша збірка, і показує «оновити».
// Працює в домашній Wi-Fi, коли на Mac запущено `npm run apk:serve`.

export const DEFAULT_UPDATE_URL = "http://192.168.0.106:8765";
const CHECK_EVERY_MS = 30 * 60_000;
// пауза між перевірками живе в пам'яті процесу: після перезапуску апки перевіряємо одразу
let checkedAt = 0;

export type Release = { versionCode: number; version: string; apk: string; notes?: string };

export const useUpdate = create<{ available: Release | null; progress: number | null; error: string | null }>(() => ({
  available: null,
  progress: null,
  error: null,
}));

export const updateUrl = () => getState<string>("update:url") ?? DEFAULT_UPDATE_URL;
export const installedVersion = () => ({ code: Number(Application.nativeBuildVersion ?? 0), name: Application.nativeApplicationVersion ?? "?" });

/** Перевірити latest.json. force — ігнорувати паузу між перевірками */
export async function checkForUpdate(force = false) {
  if (!force && Date.now() - checkedAt < CHECK_EVERY_MS) return useUpdate.getState().available;
  checkedAt = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000); // Mac не в мережі — не чекаємо довго
  try {
    const res = await fetch(`${updateUrl()}/latest.json?t=${Date.now()}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`сервер оновлень відповів ${res.status}`);
    const rel = (await res.json()) as Release;
    const available = rel.versionCode > installedVersion().code ? rel : null;
    useUpdate.setState({ available, error: null });
    return available;
  } catch (e) {
    if (force) useUpdate.setState({ error: ctrl.signal.aborted ? "Mac не відповідає — він у тій самій Wi-Fi?" : String(e) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Завантажити APK і відкрити системне встановлення поверх поточної версії */
export async function installUpdate(rel: Release) {
  useUpdate.setState({ progress: 0, error: null });
  try {
    const target = new File(Paths.cache, `groshi-${rel.versionCode}.apk`);
    if (target.exists) target.delete();
    const file = await File.downloadFileAsync(`${updateUrl()}/${rel.apk}`, target, {
      onProgress: ({ bytesWritten, totalBytes }) => totalBytes > 0 && useUpdate.setState({ progress: bytesWritten / totalBytes }),
    });
    const uri = await getContentUriAsync(file.uri);
    useUpdate.setState({ progress: null });
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: uri,
      type: "application/vnd.android.package-archive",
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION — встановлювачу треба прочитати файл
    });
  } catch (e) {
    useUpdate.setState({ progress: null, error: String(e) });
  }
}
