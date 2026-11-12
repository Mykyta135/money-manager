import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { formatMoney } from "@/lib/format";
import { currentBudget } from "@m/lib/data";
import { addShopping, clearBought, shoppingList, toggleShopping } from "@m/lib/receipts";
import { animateLayout, Button, C, Card, Empty, haptic, Row, s, toast, useDataVersion, useDb, useTopInset } from "@m/ui";

// Список покупок: оцінка суми за твоїми ж минулими чеками → чи влазить у бюджет «Продукти»

export default function Shopping() {
  const bump = useDataVersion((st) => st.bump);
  const top = useTopInset();
  const [name, setName] = useState("");
  const { list, foodLeft } = useDb(() => ({
    list: shoppingList(),
    foodLeft: currentBudget().budgets.find((b) => b.id === "food")?.left ?? null,
  }));
  const todo = list.filter((i) => !i.done);
  const estimate = todo.reduce((a, i) => a + (i.estimate ?? 0), 0);
  const unknown = todo.filter((i) => i.estimate === null).length;

  const add = () => {
    if (!name.trim()) return;
    animateLayout();
    addShopping(name.trim());
    setName("");
    bump();
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.content, { paddingTop: top }]} keyboardShouldPersistTaps="handled">
      <View style={s.row}>
        <Text style={s.title}>список покупок</Text>
        <Button kind="text" title="закрити" onPress={() => router.back()} />
      </View>

      <Card divided>
        <Row label="орієнтовно" value={formatMoney(estimate)} sub={unknown ? `+ ${unknown} без ціни` : undefined} strong />
        {foodLeft !== null && (
          <Row
            label="на продукти до зп"
            value={formatMoney(Math.max(0, foodLeft))}
            tone={estimate > 0 && estimate > foodLeft ? "bad" : undefined}
            sub={estimate > 0 && estimate > foodLeft ? "список не влазить" : undefined}
          />
        )}
      </Card>

      <Card>
        <View style={[s.row, s.inBlock]}>
          <TextInput style={[s.input, { flex: 1 }]} placeholder="куряче філе, яйця…" placeholderTextColor={C.faint} value={name} onChangeText={setName} onSubmitEditing={add} returnKeyType="done" />
          <Button kind="secondary" title="додати" disabled={!name.trim()} onPress={add} />
        </View>
      </Card>

      <Card title={list.length ? `у списку · ${todo.length}` : undefined} divided>
        {list.length === 0 && <Empty text="порожньо" />}
        {list.map((i) => (
          <Row
            key={i.id}
            label={i.done ? `✓ ${i.name}` : i.name}
            value={i.estimate !== null ? `~${formatMoney(i.estimate)}` : "—"}
            onPress={() => (haptic.tap(), animateLayout(), toggleShopping(i.id, !i.done), bump())}
          />
        ))}
      </Card>

      {list.some((i) => i.done) && (
        <Button
          kind="text"
          title="прибрати куплене"
          onPress={() => {
            animateLayout();
            clearBought();
            bump();
            toast("куплене прибрано");
          }}
        />
      )}
    </ScrollView>
  );
}
