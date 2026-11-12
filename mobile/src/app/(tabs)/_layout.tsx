import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { unreadCount } from "@m/lib/inbox";
import { toReview } from "@m/lib/review";
import { C, E, T, useDb } from "@m/ui";

const tab = (title: string, icon: ComponentProps<typeof Ionicons>["name"]) => ({
  title,
  // tint-кольори вкладок у нас — звичайні рядки
  tabBarIcon: ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={icon} color={String(color ?? C.muted)} size={size} />,
});

export default function TabsLayout() {
  const badge = useDb(() => unreadCount() + toReview().length);
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerShadowVisible: false,
        headerTintColor: C.text,
        headerTitleStyle: { fontWeight: "800", fontSize: T.title },
        headerTitleAlign: "left",
        tabBarStyle: { ...E[2], borderTopWidth: 0, elevation: 0 },
        tabBarActiveTintColor: C.text,
        tabBarInactiveTintColor: C.faint,
        tabBarLabelStyle: { fontSize: T.micro },
        tabBarBadgeStyle: { backgroundColor: C.text, color: C.bg, fontSize: T.micro },
      }}
    >
      <Tabs.Screen name="index" options={{ ...tab("сьогодні", "today-outline"), headerShown: false }} />
      <Tabs.Screen name="review" options={{ ...tab("огляд", "checkmark-done-outline"), tabBarBadge: badge > 0 ? badge : undefined }} />
      <Tabs.Screen name="transactions" options={tab("операції", "list-outline")} />
      <Tabs.Screen name="loans" options={tab("платежі", "calendar-outline")} />
      <Tabs.Screen name="settings" options={tab("ще", "settings-outline")} />
    </Tabs>
  );
}
