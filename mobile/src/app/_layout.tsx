import { useEffect } from "react";
import { AppState } from "react-native";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLastNotificationResponse } from "expo-notifications";
import { setupNotifications } from "@m/lib/notify";
import { processPushes } from "@m/lib/pushes";
import { checkForUpdate } from "@m/lib/update";
import { registerBackgroundSync } from "@m/tasks";
import { C, S, ToastHost, useDataVersion } from "@m/ui";
import { updateWidget } from "@m/widget/update";

export default function RootLayout() {
  const router = useRouter();
  const bump = useDataVersion((st) => st.bump);
  const response = useLastNotificationResponse();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    setupNotifications().then(registerBackgroundSync).catch(console.warn);
    // Фонова задача й пуші банків могли щось дописати, поки апка була згорнута
    const refresh = () => {
      checkForUpdate().catch(() => {}); // раз на 30 хв, тихо
      return processPushes().finally(() => (bump(), updateWidget()));
    };
    refresh();
    const sub = AppState.addEventListener("change", (st) => st === "active" && refresh());
    return () => sub.remove();
  }, [bump]);

  // Тап по сповіщенню → огляд (там і журнал сповіщень)
  useEffect(() => {
    const screen = response?.notification.request.content.data?.screen;
    if (screen === "review" || screen === "inbox") router.navigate("/review");
  }, [response, router]);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add" options={{ presentation: "modal" }} />
        <Stack.Screen name="receipt" options={{ presentation: "modal" }} />
        <Stack.Screen name="shopping" options={{ presentation: "modal" }} />
        <Stack.Screen name="sync" options={{ presentation: "modal" }} />
      </Stack>
      {/* над таб-баром (~64) і системною навігацією */}
      <ToastHost bottom={insets.bottom + 64 + S.sm} />
    </>
  );
}
