import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { Transaction } from "@/db/schema";
import { formatMoney } from "@/lib/format";
import { CategorySheet } from "@m/components/CategorySheet";
import { accountNames, setCategory } from "@m/lib/data";
import { clearRead, inboxItems, markAllRead, markRead } from "@m/lib/inbox";
import { approve, approveAll, recategorize, restoreReview, toReview, unapprove } from "@m/lib/review";
import { updateWidget } from "@m/widget/update";
import { animateLayout, Button, C, Card, Divider, Empty, haptic, Row, S, s, SwipeRow, toast, useDataVersion, useDb } from "@m/ui";

// Огляд: нові витрати на перевірку (свайп вправо — ок, вліво — інша категорія) + журнал сповіщень.
// Кожна дія — тост із «скасувати».

const money = (v: number) => formatMoney(v).replace(" ₴", "");

function when(ms: number) {
  const d = new Date(ms);
  const today = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
  return today ? time : `${d.toLocaleDateString("uk-UA", { day: "numeric", month: "numeric" })} ${time}`;
}

export default function Review() {
  const bump = useDataVersion((st) => st.bump);
  const { queue, notes, names } = useDb(() => ({ queue: toReview(), notes: inboxItems().slice(0, 100), names: accountNames() }));
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  /** Зміна з плавною перебудовою списку */
  const act = (fn: () => void) => {
    animateLayout();
    fn();
    bump();
  };

  const ok = (t: Transaction) => {
    act(() => approve(t.id));
    toast(`ок · ${t.description}`, { action: { label: "повернути", run: () => act(() => unapprove(t.id)) } });
  };

  const all = () => {
    haptic.ok();
    const n = queue.length;
    animateLayout();
    const prev = approveAll();
    bump();
    toast(`переглянуто ${n}`, { action: { label: "повернути", run: () => act(() => restoreReview(prev)) } });
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Card title={queue.length ? `на перевірку · ${queue.length}` : "на перевірку"}>
        {queue.length === 0 && <Empty text="усе переглянуто" />}
        {queue.map((t, i) => (
          <View key={t.id}>
            {i > 0 && <Divider />}
            <SwipeRow rightLabel="ок" leftLabel="категорія" onRight={() => ok(t)} onLeft={() => setEditing(t)}>
              <Row label={t.description} sub={`${when(t.time * 1000)} · ${t.category.toLowerCase()} · ${names.get(t.accountId) ?? ""}`} value={money(t.amount)} onPress={() => setEditing(t)} />
            </SwipeRow>
          </View>
        ))}
        {queue.length > 1 && <Button style={s.inBlock} kind="secondary" title="все ок" onPress={all} />}
      </Card>

      <Card title="сповіщення">
        {notes.length === 0 && <Empty text="поки тихо" />}
        {notes.length > 0 && (
          <View style={s.row}>
            <Button kind="text" title="прочитати всі" onPress={() => act(markAllRead)} />
            <Button kind="text" title="видалити прочитані" onPress={() => act(clearRead)} />
          </View>
        )}
        {notes.map((n) => (
          <View key={n.id}>
            <Divider />
            <Pressable
              android_ripple={{ color: C.ripple, foreground: true }}
              onPress={() => {
                act(() => markRead(n.id));
                setOpen(open === n.id ? null : n.id);
              }}
              style={[s.pressRow, { paddingVertical: S.md, gap: S.xs }]}
            >
              <View style={s.row}>
                <Text style={[s.text, { flex: 1 }, !n.read && s.strong, n.read && { color: C.muted }]} numberOfLines={1}>
                  {n.title}
                </Text>
                <Text style={[s.muted, s.num, { color: C.muted }]}>{when(n.at)}</Text>
              </View>
              <Text style={s.muted} numberOfLines={open === n.id ? undefined : 2}>
                {n.body}
              </Text>
            </Pressable>
          </View>
        ))}
      </Card>

      <CategorySheet
        tx={editing}
        onClose={() => setEditing(null)}
        onPick={(c) => {
          const t = editing!;
          act(() => recategorize(t.id, c));
          setEditing(null);
          updateWidget();
          toast(`${t.description} → ${c.toLowerCase()}`, {
            action: {
              label: "повернути",
              run: () => act(() => (setCategory(t.id, t.category), unapprove(t.id))),
            },
          });
        }}
      />
    </ScrollView>
  );
}
