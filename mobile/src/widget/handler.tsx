import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { SafeWidget } from "./SafeWidget";
import { widgetData } from "./update";

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  switch (props.widgetAction) {
    case "WIDGET_ADDED":
    case "WIDGET_UPDATE":
    case "WIDGET_RESIZED":
      props.renderWidget(<SafeWidget {...widgetData()} />);
      break;
    default:
      break;
  }
}
