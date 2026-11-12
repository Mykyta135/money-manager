import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { logNotification } from "./inbox";
import { useDataVersion } from "../ui";

export const CHANNELS = {
  spend: { id: "spend", name: "Витрати" },
  alerts: { id: "alerts", name: "Попередження (ліміт, платежі)" },
  digest: { id: "digest", name: "Підсумки й поради" },
} as const;

type Channel = keyof typeof CHANNELS;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Канали треба створити ДО запиту дозволу — інакше Android 13+ не покаже діалог */
export async function setupNotifications() {
  await Notifications.setNotificationChannelAsync(CHANNELS.spend.id, {
    name: CHANNELS.spend.name,
    importance: AndroidImportance.DEFAULT,
  });
  await Notifications.setNotificationChannelAsync(CHANNELS.alerts.id, {
    name: CHANNELS.alerts.name,
    importance: AndroidImportance.HIGH,
  });
  await Notifications.setNotificationChannelAsync(CHANNELS.digest.id, {
    name: CHANNELS.digest.name,
    importance: AndroidImportance.LOW,
  });
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

/** Показати сповіщення і записати в журнал апки (вкладка «огляд») */
export function notify(channel: Channel, title: string, body: string) {
  logNotification(channel, title, body);
  useDataVersion.getState().bump(); // бейдж непрочитаних
  return Notifications.scheduleNotificationAsync({
    content: { title, body, data: { screen: "review" } },
    trigger: { channelId: CHANNELS[channel].id },
  });
}

/** Правило 24 годин: нагадати про бажану покупку завтра — якщо ще хочеться, тоді й вирішувати */
export function remindTomorrow(title: string, body: string) {
  return Notifications.scheduleNotificationAsync({
    content: { title, body, data: { screen: "review" } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 24 * 3600, channelId: CHANNELS.digest.id },
  });
}
