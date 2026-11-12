import { useMemo, useState } from "react";
import { FlatList, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Transaction } from "@/db/schema";
import { dayTitle, groupByDay, type FeedItem } from "@/lib/feed";
import { formatMoney } from "@/lib/format";
import { CategorySheet } from "@m/components/CategorySheet";
import { accountNames, recentTransactions, setCategory } from "@m/lib/data";
import { C, Card, Chip, E, Empty, R, Row, S, s, Sheet, T, toast, useDataVersion, useDb } from "@m/ui";

const money = (v: number) => formatMoney(v).replace(" ₴", "");
const time = (sec: number) => new Date(sec * 1000).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });

export default function Transactions() {
  const bump = useDataVersion((st) => st.bump);
  const { rows, names } = useDb(() => ({ rows: recentTransactions(2000), names: accountNames() }));
  const [query, setQuery] = useState("");
  const [account, setAccount] = useState<string | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [group, setGroup] = useState<Transaction[] | null>(null);

  const days = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((t) => (!account || t.accountId === account) && (!q || t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)));
    // без пошуку показуємо останні 300 — далі пошуком
    return groupByDay(q || account ? filtered : filtered.slice(0, 300));
  }, [rows, query, account]);

  const usedAccounts = useMemo(() => [...new Set(rows.map((t) => t.accountId))], [rows]);

  const item = (i: FeedItem<Transaction>) =>
    i.kind === "installments" ? (
      <Row key={i.id} label="розстрочки" sub={`${i.items.length} платежів`} value={money(i.total)} chevron="right" onPress={() => setGroup(i.items)} />
    ) : (
      <Row
        key={i.tx.id}
        label={i.tx.description}
        sub={`${time(i.tx.time)} · ${i.tx.category.toLowerCase()}${i.tx.isTransfer ? " · між своїми" : ""} · ${names.get(i.tx.accountId) ?? ""}`}
        value={`${i.tx.amount > 0 ? "+" : ""}${money(i.tx.amount)}`}
        tone={i.tx.amount > 0 && !i.tx.isTransfer ? "ok" : undefined}
        onPress={() => setEditing(i.tx)}
      />
    );

  return (
    <>
      <FlatList
        style={s.screen}
        contentContainerStyle={s.content}
        data={days}
        keyExtractor={(d) => d.key}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={6}
        ListHeaderComponent={
          <View style={{ gap: S.md }}>
            <View style={[s.row, E[1], { borderRadius: R.pill, paddingHorizontal: S.lg, gap: S.sm }]}>
              <Ionicons name="search" size={T.body} color={C.faint} />
              <TextInput
                testID="search"
                style={[s.input, { flex: 1, borderBottomWidth: 0 }]}
                value={query}
                onChangeText={setQuery}
                placeholder="назва або категорія"
                placeholderTextColor={C.faint}
              />
            </View>
            <View style={s.chips}>
              {usedAccounts.map((id) => (
                <Chip key={id} label={names.get(id) ?? id} active={account === id} onPress={() => setAccount(account === id ? null : id)} />
              ))}
            </View>
          </View>
        }
        renderItem={({ item: d }) => (
          <Card title={dayTitle(d.date)} aside={d.spent > 0 ? `−${money(d.spent)}` : undefined} divided>
            {d.items.map(item)}
          </Card>
        )}
        ListEmptyComponent={<Empty text="нічого не знайдено" />}
      />

      <CategorySheet
        tx={editing}
        onClose={() => setEditing(null)}
        onPick={(c) => {
          const t = editing!;
          setCategory(t.id, c);
          setEditing(null);
          bump();
          toast(`${t.description} → ${c.toLowerCase()}`, { action: { label: "повернути", run: () => (setCategory(t.id, t.category), bump()) } });
        }}
      />

      <Sheet title="розстрочки" visible={!!group} onClose={() => setGroup(null)}>
        {group?.map((t) => (
          <Row key={t.id} label={t.description} value={money(t.amount)} />
        ))}
      </Sheet>
    </>
  );
}
