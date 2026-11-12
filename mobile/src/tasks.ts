import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { runChecks } from "./lib/checks";
import { processPushes } from "./lib/pushes";
import { setState } from "./lib/state";
import { syncStep } from "./lib/sync";
import { updateWidget } from "./widget/update";

export const SYNC_TASK = "money-sync";

// Android запускає це раз на 15+ хв (WorkManager), а також одразу після пушу банку
// (BankNotificationListener будить той самий воркер)
TaskManager.defineTask(SYNC_TASK, async () => {
  try {
    const pushes = await processPushes();
    // Після пушу не чекаємо ліміт моно — синк зробиться наступним плановим запуском
    const result = pushes ? `пушів: ${pushes}` : await syncStep();
    await runChecks();
    updateWidget();
    setState("bg:lastRun", { at: Date.now(), result });
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    setState("bg:lastRun", { at: Date.now(), result: `помилка: ${String(e)}` });
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundSync() {
  if (await TaskManager.isTaskRegisteredAsync(SYNC_TASK)) return;
  await BackgroundTask.registerTaskAsync(SYNC_TASK, { minimumInterval: 15 });
}
