// Фонова задача й віджет мають бути зареєстровані до старту застосунку — Android запускає бандл без UI
import { registerWidgetTaskHandler } from "react-native-android-widget";
import "./src/tasks";
import "./src/lib/geo";
import { widgetTaskHandler } from "./src/widget/handler";
import "expo-router/entry";

registerWidgetTaskHandler(widgetTaskHandler);
