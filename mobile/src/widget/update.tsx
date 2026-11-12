import { requestWidgetUpdate } from "react-native-android-widget";
import { formatMoney } from "@/lib/format";
import { cyclePace, picture, streakLines } from "@m/lib/data";
import { paceText, paceTone } from "@m/components/PaceLine";
import { SafeWidget, type WidgetData } from "./SafeWidget";

export const WIDGET_NAME = "Safe";

export function widgetData(): WidgetData {
  const pic = picture();
  const b = pic.budget;
  const payday = b.to.toLocaleDateString("uk-UA", { day: "numeric", month: "numeric" });
  return {
    safe: formatMoney(pic.safe),
    caption: `${b.daysLeft} дн. до ЗП (${payday})${b.incomeKnown ? "" : " · ЗП ще не прийшла"}`,
    streak: streakLines().filter((x) => x.days > 0).sort((a, b) => b.days - a.days)[0]?.label ?? "",
    empty: pic.safe === 0,
    pace: paceText(cyclePace(b), b.totalSpent, b.totalLimit),
    paceColor: String(paceTone(cyclePace(b))),
  };
}

/** Перемалювати віджет після змін у даних (синк, нова витрата, імпорт) */
export function updateWidget() {
  try {
    const data = widgetData();
    requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: () => <SafeWidget {...data} />, widgetNotFound: () => {} });
  } catch (e) {
    console.warn("widget", e);
  }
}
