import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { formatMoney } from "@/lib/format";
import { loanStats, paymentSchedule } from "@/lib/loans";
import { addLoan, allLoans, deleteLoan, hideSubscription, subscriptions } from "@m/lib/data";
import { MonthCalendar } from "@m/components/MonthCalendar";
import { animateLayout, Button, Card, Empty, Field, haptic, Row, s, Sheet, toast, useDataVersion, useDb } from "@m/ui";

const MONTHS = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];
const label = (m: string) => `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`;
const money = (v: number) => formatMoney(v).replace(" ₴", "");
const dm = (sec: number) => new Date(sec * 1000).toLocaleDateString("uk-UA", { day: "numeric", month: "numeric" });

const EMPTY = { name: "", bank: "mono", principal: "", monthly: "", term: "", start: "" };
type Form = typeof EMPTY;
const FIELDS: { key: keyof Form; label: string; numeric?: boolean; placeholder?: string }[] = [
  { key: "name", label: "назва" },
  { key: "bank", label: "банк", placeholder: "mono / ukrsib / pumb" },
  { key: "principal", label: "сума покупки, ₴", numeric: true },
  { key: "monthly", label: "щомісячний платіж, ₴", numeric: true },
  { key: "term", label: "кількість платежів", numeric: true },
  { key: "start", label: "перший платіж", placeholder: "2026-12-05" },
];

export default function Loans() {
  const bump = useDataVersion((st) => st.bump);
  const [form, setForm] = useState<Form | null>(null);
  const { list, schedule, remaining, subs } = useDb(() => {
    const list = allLoans();
    return {
      list,
      subs: subscriptions(),
      schedule: paymentSchedule(list, 30).filter((m) => m.total > 0),
      remaining: list.reduce((acc, l) => acc + loanStats(l).remaining, 0),
    };
  });

  const valid =
    form &&
    form.name &&
    ["mono", "ukrsib", "pumb"].includes(form.bank) &&
    Number(form.principal) > 0 &&
    Number(form.monthly) > 0 &&
    Number(form.term) > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(form.start);

  const save = () => {
    if (!form || !valid) return;
    addLoan({
      name: form.name,
      bank: form.bank as "mono" | "ukrsib" | "pumb",
      principal: Math.round(Number(form.principal) * 100),
      monthlyPayment: Math.round(Number(form.monthly) * 100),
      termMonths: Number(form.term),
      startDate: form.start,
    });
    setForm(null);
    animateLayout();
    bump();
    haptic.ok();
    toast(`додано «${form.name}»`);
  };

  // видаляємо одразу, а «скасувати» в тості повертає — без діалогу підтвердження
  const remove = (loan: (typeof list)[number]) => {
    animateLayout();
    deleteLoan(loan.id);
    bump();
    toast(`видалено «${loan.name}»`, { action: { label: "скасувати", run: () => (addLoan(loan), animateLayout(), bump()) } });
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <View>
        <Text style={s.muted}>лишилось заплатити</Text>
        <Text style={s.big}>{formatMoney(remaining)}</Text>
      </View>

      <MonthCalendar />

      <Card title="по місяцях" divided>
        {schedule.map((m) => (
          <Row key={m.month} label={label(m.month)} sub={m.ending.length ? `закінчується: ${m.ending.join(", ")}` : undefined} value={money(m.total)} />
        ))}
      </Card>

      <Card title={`підписки · ${money(subs.reduce((a, x) => a + x.lastAmount, 0))}/міс`} divided>
        {subs.map((x) => (
          <Row
            key={x.key}
            label={x.name}
            sub={`${x.charges === 1 ? "нова · " : ""}наступне ${dm(x.nextAt)}${x.increased ? ` · було ${money(x.prevAmount)}` : ""}`}
            value={money(x.lastAmount)}
            bad={x.increased}
            onLongPress={() => {
              animateLayout();
              hideSubscription(x.key);
              bump();
              toast(`приховано «${x.name}»`);
            }}
          />
        ))}
        {subs.length === 0 && <Empty text="не знайдено" />}
      </Card>

      <Card title="розстрочки · утримуй — видалити" divided>
        {list.map((l) => {
          const st = loanStats(l);
          return (
            <Row key={l.id} label={l.name} sub={`${money(l.monthlyPayment)} × ${st.monthsLeft} з ${l.termMonths}`} value={money(st.remaining)} onLongPress={() => remove(l)} />
          );
        })}
        <Button style={s.inBlock} kind="secondary" title="додати розстрочку" onPress={() => setForm(EMPTY)} />
      </Card>

      <Sheet title="нова розстрочка" visible={!!form} onClose={() => setForm(null)}>
        {form && (
          <>
            {FIELDS.map((f) => (
              <Field
                key={f.key}
                label={f.label}
                value={form[f.key]}
                placeholder={f.placeholder}
                autoCapitalize="none"
                keyboardType={f.numeric ? "numeric" : "default"}
                onChangeText={(v) => setForm({ ...form, [f.key]: v })}
              />
            ))}
            <Button title="додати" disabled={!valid} onPress={save} />
          </>
        )}
      </Sheet>
    </ScrollView>
  );
}
