import { FlexWidget, TextWidget } from "react-native-android-widget";
import { C, R, S, T } from "../tokens";

// Віджет на робочий стіл. Тільки примітиви бібліотеки, без хуків — дані приходять пропсами.

export type WidgetData = { safe: string; caption: string; streak: string; empty?: boolean; pace?: string; paceColor?: string };

// ті самі токени, що в апці (віджет не вміє тіні — глибину дає світліша поверхня)
const BG = C.raised;
const TEXT = C.text;
const MUTED = C.muted;
const ACCENT = C.text;
const BAD = C.bad;
const GOLD = C.gold;

function Action({ label, uri }: { label: string; uri: string }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri }}
      style={{ flex: 1, backgroundColor: ACCENT, borderRadius: R.pill, paddingVertical: S.sm, alignItems: "center", justifyContent: "center" }}
    >
      <TextWidget text={label} style={{ color: C.bg, fontSize: T.small, fontWeight: "700" }} />
    </FlexWidget>
  );
}

export function SafeWidget({ safe, caption, streak, empty, pace, paceColor }: WidgetData) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{ height: "match_parent", width: "match_parent", backgroundColor: BG, borderRadius: R.xl, padding: S.lg, flexDirection: "column", justifyContent: "space-between" }}
    >
      <FlexWidget style={{ flexDirection: "column" }}>
        <TextWidget text="можна сьогодні" style={{ color: MUTED, fontSize: T.caption }} />
        <TextWidget text={safe} style={{ color: empty ? BAD : TEXT, fontSize: T.title + S.sm, fontWeight: "800" }} />
        <TextWidget text={caption} style={{ color: MUTED, fontSize: T.caption }} />
        {pace ? <TextWidget text={pace} style={{ color: (paceColor ?? MUTED) as `#${string}`, fontSize: T.caption }} /> : null}
        {streak ? <TextWidget text={streak} style={{ color: GOLD, fontSize: T.caption, marginTop: S.xxs }} /> : null}
      </FlexWidget>
      <FlexWidget style={{ flexDirection: "row", flexGap: S.sm, width: "match_parent" }}>
        <Action label="+ витрата" uri="money://add" />
        <Action label="чек" uri="money://receipt" />
      </FlexWidget>
    </FlexWidget>
  );
}
