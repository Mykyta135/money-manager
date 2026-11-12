import { Text, View } from "react-native";
import { formatMoney } from "@/lib/format";
import type { Pace } from "@/lib/pace";
import { C, R, S, s } from "@m/ui";

const TRACK = 6; // товщина смужки

const pct = (x: number) => `${Math.round(x * 100)}%`;
const dm = (d: Date) => d.toLocaleDateString("uk-UA", { day: "numeric", month: "long" });

export const paceTone = (p: Pace) => (p.verdict === "over" ? C.bad : p.verdict === "ok" ? C.ok : p.verdict === "under" ? C.gold : C.muted);

/** Підпис темпу — однаковий для екрана й віджета */
export function paceText(p: Pace, spent: number, limit: number) {
  if (spent > limit) return `бюджет циклу перевитрачено на ${formatMoney(spent - limit)}`;
  const ratio = `${pct(p.spentPct)} бюджету за ${pct(p.timePct)} циклу`;
  if (p.verdict === "early") return `початок циклу · ${ratio}`;
  if (p.verdict === "ok") return `в темпі · ${ratio}`;
  if (p.verdict === "under") return `повільніше за план · ${ratio}`;
  return `швидше за план · ${ratio}`;
}

/** Смужка: заливка — витрачено з бюджету, риска — скільки минуло циклу */
export function PaceLine({ pace: p, spent, limit, to }: { pace: Pace; spent: number; limit: number; to: Date }) {
  const tone = paceTone(p);
  const showForecast = spent <= limit && p.verdict !== "early";
  return (
    <View style={{ gap: S.sm, marginTop: S.md }}>
      <View style={{ height: TRACK, backgroundColor: C.line, borderRadius: R.pill }}>
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${Math.min(100, p.spentPct * 100)}%`,
            backgroundColor: tone,
            borderRadius: R.pill,
            boxShadow: `0 0 10px 0 ${tone}55`, // легке світіння заливки
          }}
        />
        <View style={{ position: "absolute", top: -S.xs, bottom: -S.xs, width: S.xxs, left: `${p.timePct * 100}%`, backgroundColor: C.text, borderRadius: R.pill }} />
      </View>
      <Text style={[s.muted, { color: tone === C.muted ? C.muted : tone }]}>{paceText(p, spent, limit)}</Text>
      {showForecast && (
        <Text style={s.muted}>
          у такому темпі до {dm(to)}: {p.projectedLeft >= 0 ? `лишиться ${formatMoney(p.projectedLeft)}` : `не вистачить ${formatMoney(-p.projectedLeft)}`}
        </Text>
      )}
    </View>
  );
}
