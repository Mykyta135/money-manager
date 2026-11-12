import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { formatMoney } from "@/lib/format";
import { monthCalendar, weeklyTotals } from "@m/lib/calendar";
import { animateLayout, C, Card, Divider, Empty, haptic, R, Row, S, s, T, useDb } from "@m/ui";

const MONTHS = ["січень", "лютий", "березень", "квітень", "травень", "червень", "липень", "серпень", "вересень", "жовтень", "листопад", "грудень"];
const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "нд"];
const short = (v: number) => (v >= 100_000 ? `${Math.round(v / 100_000)}k` : String(Math.round(v / 100)));
const money = (v: number) => formatMoney(v).replace(" ₴", "");
const CELL = 46; // висота клітинки: число + сума дня

/** Сітка місяця: у клітинці — сума обов'язкових витрат дня, «зп» у день зарплати */
export function MonthCalendar() {
  const [offset, setOffset] = useState(0);
  const [today] = useState(() => new Date());
  const [selected, setSelected] = useState<number | null>(null);
  const year = new Date(today.getFullYear(), today.getMonth() + offset, 1).getFullYear();
  const month = new Date(today.getFullYear(), today.getMonth() + offset, 1).getMonth();
  const { days, total, weeks } = useDb(() => {
    const c = monthCalendar(year, month);
    return { ...c, weeks: weeklyTotals(year, month, c.days) };
  });

  const lastDay = new Date(year, month + 1, 0).getDate();
  const lead = (new Date(year, month, 1).getDay() + 6) % 7; // понеділок першим
  const cells = [...Array(lead).fill(null), ...Array.from({ length: lastDay }, (_, i) => i + 1)];
  const isToday = (d: number) => offset === 0 && d === today.getDate();
  const events = selected ? (days.get(selected) ?? []) : [];
  const shift = (by: number) => {
    haptic.tap();
    animateLayout();
    setOffset(offset + by);
    setSelected(null);
  };

  return (
    <Card title="календар обов'язкових">
      <View style={[s.row, { paddingVertical: S.md }]}>
        <Pressable onPress={() => shift(-1)} hitSlop={S.md}>
          <Ionicons name="chevron-back" size={T.body} color={C.muted} />
        </Pressable>
        <Text style={[s.text, s.strong]}>
          {MONTHS[month]} {year} · {money(total)}
        </Text>
        <Pressable onPress={() => shift(1)} hitSlop={S.md}>
          <Ionicons name="chevron-forward" size={T.body} color={C.muted} />
        </Pressable>
      </View>

      <View style={{ flexDirection: "row" }}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={[s.muted, { flex: 1, textAlign: "center", fontSize: T.micro }]}>
            {w}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", paddingVertical: S.xs }}>
        {cells.map((d, i) => {
          const ev = d ? (days.get(d) ?? []) : [];
          const sum = ev.reduce((a, e) => a + e.amount, 0);
          const payday = ev.some((e) => e.kind === "payday");
          return (
            <Pressable
              key={i}
              disabled={!d}
              onPress={() => {
                if (!d) return;
                haptic.tap();
                animateLayout();
                setSelected(d === selected ? null : d);
              }}
              android_ripple={{ color: C.ripple, borderless: false }}
              style={{
                width: `${100 / 7}%`,
                height: CELL,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: R.sm,
                borderWidth: isToday(d ?? 0) ? 1 : 0,
                borderColor: C.text,
                backgroundColor: d === selected ? C.raised : "transparent",
              }}
            >
              {d && <Text style={[s.text, { fontSize: T.small }, !ev.length && { color: C.faint }]}>{d}</Text>}
              {d && (sum > 0 || payday) && <Text style={{ color: payday ? C.gold : C.muted, fontSize: T.micro, fontVariant: ["tabular-nums"] }}>{payday ? "зп" : short(sum)}</Text>}
            </Pressable>
          );
        })}
      </View>

      {selected !== null && (
        <View style={{ paddingBottom: S.sm }}>
          <Divider />
          <Text style={s.sublabel}>
            {selected} {MONTHS[month]}
          </Text>
          {events.length === 0 && <Empty text="нічого обов'язкового" />}
          {events.map((e, i) => (
            <Row key={i} label={e.title} value={e.kind === "payday" ? "" : money(e.amount)} sub={e.kind === "sub" ? "підписка" : e.kind === "loan" ? "розстрочка" : undefined} />
          ))}
        </View>
      )}

      <Divider />
      <Text style={s.sublabel}>по тижнях</Text>
      {weeks.map((w, i) => (
        <View key={w.from}>
          {i > 0 && <Divider />}
          <Row label={w.from === w.to ? String(w.from) : `${w.from}–${w.to}`} value={money(w.total)} />
        </View>
      ))}
    </Card>
  );
}
