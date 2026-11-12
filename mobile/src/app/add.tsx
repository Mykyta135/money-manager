import { useState } from "react";
import { Animated, Pressable, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { gte } from "drizzle-orm";
import { transactions } from "@/db/schema";
import { budgetFor } from "@/lib/budget";
import { guessCategory } from "@/lib/feed";
import { formatMoney } from "@/lib/format";
import { db } from "@m/db";
import { accountNames, addManual, allAccounts, CASH_ACCOUNT, currentBudget, deleteTransaction, loansNextDays } from "@m/lib/data";
import { remindTomorrow } from "@m/lib/notify";
import { reactToNew } from "@m/lib/spend";
import { getState, setState } from "@m/lib/state";
import { Button, C, Chip, E, Field, haptic, R, S, s, T, toast, useDataVersion, useDb, useTopInset } from "@m/ui";
import { updateWidget } from "@m/widget/update";

// Швидке додавання витрати (з віджета) і «Чи можу я собі це дозволити?» (?check=1)

type Last = { category: string; account: string };
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"];

function press(amount: string, key: string) {
  if (key === "⌫") return amount.slice(0, -1);
  if (key === ",") return amount.includes(",") ? amount : `${amount || "0"},`;
  if (amount.includes(",") && amount.split(",")[1].length >= 2) return amount;
  if (amount.replace(",", "").length >= 8) return amount;
  return amount === "0" ? key : amount + key;
}

/** «12345,5» → «12 345,5» */
const pretty = (amount: string) => {
  const [int, frac] = amount.split(",");
  return `${(int || "0").replace(/\B(?=(\d{3})+(?!\d))/g, " ")}${frac !== undefined ? `,${frac}` : ""}`;
};

export default function Add() {
  const { check } = useLocalSearchParams<{ check?: string }>();
  const onlyCheck = check === "1";
  const bump = useDataVersion((st) => st.bump);
  const top = useTopInset();
  const { budget, accounts, names, weekAhead, guess, last } = useDb(() => {
    const budget = currentBudget();
    const last = getState<Last>("add:last");
    const since = Math.floor(Date.now() / 1000) - 90 * 86_400;
    const history = db.select({ time: transactions.time, category: transactions.category, amount: transactions.amount }).from(transactions).where(gte(transactions.time, since)).all();
    return {
      budget,
      last,
      accounts: allAccounts().filter((a) => a.id !== CASH_ACCOUNT && a.currency === "UAH"),
      names: accountNames(),
      weekAhead: loansNextDays(7),
      guess: guessCategory(history, budget.budgets.map((b) => b.categories[0]), new Date(), last?.category),
    };
  });
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [account, setAccount] = useState(last?.account ?? CASH_ACCOUNT);
  const [category, setCategory] = useState(guess ?? "Інше");
  const [reminded, setReminded] = useState(false);
  const [pop] = useState(() => new Animated.Value(1));

  const value = Math.round(Number(amount.replace(",", ".")) * 100) || 0;
  const b = budgetFor(budget, category);
  const leftTotal = budget.totalLimit - budget.totalSpent;
  const safeAfter = Math.max(0, Math.floor((leftTotal - value) / budget.daysLeft));
  const verdict = value === 0 ? null : value > leftTotal ? "ні — це більше, ніж лишилось до зп" : b && value > b.left ? `можна, але «${b.name.toLowerCase()}» піде в мінус на ${formatMoney(value - b.left)}` : "так, у межах бюджету";
  const verdictTone = value === 0 ? undefined : value > leftTotal ? C.bad : b && value > b.left ? C.warn : C.ok;

  /** Натиск клавіші: сума легенько «підстрибує» — видно, що ввід прийнято */
  const key = (k: string) => {
    haptic.tap();
    setAmount(press(amount, k));
    pop.setValue(1.04);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 10 }).start();
  };

  const save = async () => {
    const row = addManual({ amount: -value, category, description: note || category, accountId: account });
    setState("add:last", { category, account });
    haptic.ok();
    await reactToNew([row]);
    bump();
    toast(`${formatMoney(-value)} · ${(note || category).toLowerCase()}`, {
      action: {
        label: "скасувати",
        run: () => {
          deleteTransaction(row.id);
          useDataVersion.getState().bump();
          updateWidget();
        },
      },
    });
    router.back();
  };

  return (
    <View style={s.screen}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.content, { paddingTop: top, gap: S.lg, paddingBottom: S.md }]} keyboardShouldPersistTaps="handled">
        <View style={s.row}>
          <Text style={s.title}>{onlyCheck ? "чи можу собі" : "нова витрата"}</Text>
          <Button kind="text" title={onlyCheck ? "закрити" : "скасувати"} onPress={() => router.back()} />
        </View>

        <Animated.Text testID="amount" style={[s.big, !value && { color: C.faint }, { transform: [{ scale: pop }], transformOrigin: "left center" }]} numberOfLines={1} adjustsFontSizeToFit>
          {pretty(amount)} ₴
        </Animated.Text>

        {value > 0 && (
          <View style={{ gap: S.xxs }}>
            <Text style={[s.text, s.strong, { color: verdictTone }]}>{verdict}</Text>
            <Text style={s.muted}>
              на день {formatMoney(budget.safeToday)} → {formatMoney(safeAfter)}
              {weekAhead > 0 ? ` · за 7 днів розстрочки ${formatMoney(weekAhead)}` : ""}
            </Text>
          </View>
        )}

        <View style={s.chips}>
          {budget.budgets.map((bg) => (
            <Chip key={bg.id} label={bg.name.toLowerCase()} active={bg.categories.includes(category)} onPress={() => setCategory(bg.categories[0])} />
          ))}
        </View>

        {!onlyCheck && (
          <>
            <View style={s.chips}>
              {[CASH_ACCOUNT, ...accounts.map((a) => a.id)].map((id) => (
                <Chip key={id} label={id === CASH_ACCOUNT ? "готівка" : (names.get(id) ?? id)} active={account === id} onPress={() => setAccount(id)} />
              ))}
            </View>
            <Field placeholder="що купив" value={note} onChangeText={setNote} />
          </>
        )}
      </ScrollView>

      {/* нумпад і кнопка завжди внизу, під великим пальцем */}
      <View style={[E[2], { paddingHorizontal: S.lg, paddingTop: S.sm, paddingBottom: S.xl, gap: S.sm, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl }]}>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {KEYS.map((k) => (
            <View key={k} style={{ width: "33.33%", padding: S.xs }}>
              <Pressable
                testID={`key-${k}`}
                onPress={() => key(k)}
                onLongPress={() => k === "⌫" && (haptic.tap(), setAmount(""))}
                android_ripple={{ color: C.ripple, borderless: false, foreground: true }}
                style={{ alignItems: "center", paddingVertical: S.md, borderRadius: R.md, overflow: "hidden" }}
              >
                <Text style={[s.text, s.num, { fontSize: T.numpad, fontWeight: "400" }]}>{k}</Text>
              </Pressable>
            </View>
          ))}
        </View>

        {onlyCheck ? (
          <Button
            title={reminded ? "нагадаю завтра" : "подумати добу"}
            disabled={value <= 0 || reminded}
            onPress={() => {
              remindTomorrow(`Ще хочеш за ${formatMoney(value)}?`, "Минула доба. Якщо досі потрібно — бери, якщо ні — гроші лишились у тебе");
              setReminded(true);
              haptic.ok();
              toast("нагадаю завтра");
            }}
          />
        ) : (
          <Button title="зберегти" disabled={value <= 0} onPress={save} />
        )}
      </View>
    </View>
  );
}
