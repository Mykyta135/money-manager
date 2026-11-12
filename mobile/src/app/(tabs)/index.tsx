import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import type { BudgetStatus } from "@/lib/budget";
import { formatMoney } from "@/lib/format";
import { PaceLine } from "@m/components/PaceLine";
import { UpdateBanner } from "@m/components/UpdateBanner";
import { accountNames, allAccounts, cyclePace, forecast, picture, reality, savedTotal, setBudgetLimit, streakLines } from "@m/lib/data";
import { groupsSince } from "@m/lib/receipts";
import { paydayPlan } from "@m/lib/spend";
import { syncStep } from "@m/lib/sync";
import { budgetTone, Button, C, Card, Divider, Field, Fold, haptic, Row, S, s, Sheet, T, toast, useDataVersion, useDb, useTopInset } from "@m/ui";
import { updateWidget } from "@m/widget/update";

const dm = (d: Date) => d.toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
const money = (v: number) => formatMoney(v).replace(" ₴", "");
const minus = (v: number) => (v ? `−${money(v)}` : "0");
const approx = (v: number) => `≈ ${v < 0 ? "−" : ""}${money(Math.abs(Math.round(v / 10_000) * 10_000))}`; // до сотні — це прогноз
const monthYear = (d: Date) => d.toLocaleDateString("uk-UA", { month: "long", year: "numeric" });

export default function Today() {
  const bump = useDataVersion((st) => st.bump);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string; value: string } | null>(null);
  const [salary, setSalary] = useState<string | null>(null);

  const { pic, budget, pace, fc, real, accounts, names, saved, series, groups } = useDb(() => {
    const p = picture();
    return {
      pic: p,
      fc: forecast(),
      real: reality(),
      budget: p.budget,
      pace: cyclePace(p.budget),
      accounts: allAccounts(),
      names: accountNames(),
      saved: savedTotal(),
      series: streakLines().filter((x) => x.days > 0),
      groups: groupsSince(Math.floor(p.budget.from.getTime() / 1000)),
    };
  });

  const top = useTopInset();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      toast(await syncStep());
      bump();
      updateWidget();
    } catch (e) {
      haptic.bad();
      toast(String(e), { tone: "bad" });
    } finally {
      setRefreshing(false);
    }
  }, [bump]);

  const overspent = budget.totalSpent - budget.totalLimit;
  const attention = budget.budgets.filter((b) => budgetTone(b.spent, b.limitUah));
  const calm = budget.budgets.filter((b) => !budgetTone(b.spent, b.limitUah));
  const overSum = attention.reduce((a, b) => a + Math.max(0, -b.left), 0);
  const ownTotal = accounts.filter((a) => a.currency === "UAH").reduce((a, x) => a + x.own, 0);

  const budgetRow = (b: BudgetStatus) => {
    const tone = budgetTone(b.spent, b.limitUah);
    return (
      <Row
        key={b.id}
        label={b.name.toLowerCase()}
        value={`${money(b.spent)} / ${money(b.limitUah)}`}
        tone={tone}
        sub={b.left < 0 ? `перевитрата ${money(-b.left)}` : tone ? `лишилось ${money(b.left)}` : undefined}
        onPress={() => setEditing({ id: b.id, name: b.name, value: String(Math.round(b.limitUah / (budget.scale || 1) / 100)) })}
      />
    );
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.text]} progressBackgroundColor={C.raised} progressViewOffset={top} />}>
      <View style={[s.hero, { paddingTop: top + S.lg }]}>
        <Text style={s.muted}>можна сьогодні</Text>
        <Text style={[s.big, pic.safe === 0 && { color: C.bad }]} adjustsFontSizeToFit numberOfLines={1}>
          {formatMoney(pic.safe)}
        </Text>
        <Text style={s.muted}>
          до зп {budget.daysLeft} дн. · {dm(budget.to)}
          {budget.essentialOnly ? " · тільки обов'язкове" : pic.realSafe < budget.safeToday ? " · на рахунках менше, ніж за планом" : ""}
        </Text>
        <PaceLine pace={pace} spent={budget.totalSpent} limit={budget.totalLimit} to={budget.to} />
      </View>

      <UpdateBanner />

      <View style={{ gap: S.xs }}>
        <Button title="+ витрата" onPress={() => router.push("/add")} />
        <View style={[s.row, { justifyContent: "space-around" }]}>
          <Button kind="text" title="чи можу собі" onPress={() => router.push({ pathname: "/add", params: { check: "1" } })} />
          <Button kind="text" title="чек" onPress={() => router.push("/receipt")} />
          <Button kind="text" title="список" onPress={() => router.push("/shopping")} />
        </View>
      </View>

      {(overspent > 0 || budget.essentialOnly || real.findings.length > 0) && (
        <Card title="реалізм" divided>
          {budget.essentialOnly && (
            <Row label="тільки обов'язкове" value={`${money(pic.essentialDaily)}/день`} tone="warn" sub="реальних грошей до зп нема: кафе, перекуси, одяг та інше заморожено; їжа, дорога, ліки — вже в борг" />
          )}
          {overspent > 0 && <Row label="перевитрата циклу" value={minus(overspent)} tone="bad" />}
          {real.findings.map((f) => (
            <Row key={f.key} label={f.title} value={f.value} tone={f.tone} sub={f.detail} />
          ))}
        </Card>
      )}

      <Card title="прогноз" divided>
        <Row
          label="на день зп буде"
          value={approx(fc.atPayday)}
          tone={fc.atPayday < 0 ? "bad" : "ok"}
          sub={`темп ${money(fc.daily)}/день · ще ${budget.daysLeft} дн.`}
        />
        <Row label="після зп лишиться" value={approx(fc.afterSalary)} tone={fc.afterSalary < budget.loans ? "warn" : undefined} sub={`зп ${approx(fc.income)} · розстрочки наступного циклу ${money(budget.loans)}`} />
        {fc.debtFreeAt !== undefined && (
          <Row
            label="мінус закриється"
            value={fc.debtFreeAt ? monthYear(fc.debtFreeAt) : "ніколи"}
            tone={fc.debtFreeAt ? "gold" : "bad"}
            sub={fc.debtFreeAt ? "якщо жити в межах лімітів · далі відкладання" : "ліміти більші, ніж дозволяє зп — зменш їх"}
          />
        )}
      </Card>

      <Card>
        <Fold label="вільно до зп" value={money(pic.free)} tone={pic.free < 0 ? "bad" : "ok"} sub={pic.free < 0 ? "не вистачає до зп" : undefined} strong>
          <Row label="власні на рахунках" value={money(pic.own)} bad={pic.own < 0} />
          <Row label="розстрочки до зп" value={minus(pic.loansLeft)} />
          <Row label="підписки до зп" value={minus(pic.subsLeft)} />
          {pic.pending > 0 && <Row label="зп, що от-от прийде" value={`+${money(pic.pending)}`} />}
          {budget.debtAfter > 0 && <Row label="мінус, що лишиться на наступну зп" value={`+${money(budget.debtAfter)}`} sub="за планом «спершу борг»" />}
          {budget.incomeKnown && (
            <Row
              label="ще відкласти"
              value={minus(pic.savingsLeft)}
              tone={pic.savingsLeft ? undefined : "gold"}
              sub={pic.savingsLeft || !budget.savings ? undefined : `${money(budget.savings)} уже відкладено`}
            />
          )}
        </Fold>
        <Divider />
        <Fold
          label={budget.incomeKnown ? "розподіл зп" : "розподіл зп · від середньої"}
          value={money(budget.income)}
          sub={[budget.debt > 0 && "спершу борг", budget.scale < 1 && `ліміти урізано до ${Math.round(budget.scale * 100)}%`].filter(Boolean).join(" · ") || undefined}
        >
          <Row label="розстрочки" value={minus(budget.loans)} />
          <Row label="на життя" value={money(budget.life)} bad={budget.life <= 0} strong sub={budget.shortfall > 0 ? `бракує ${money(budget.shortfall)} навіть на розстрочки` : undefined} />
          {budget.debt > 0 && (
            <Row
              label="закрити мінус"
              value={minus(budget.paydown)}
              tone={budget.debtAfter > 0 ? "warn" : "ok"}
              sub={budget.debtAfter > 0 ? `з ${money(budget.debt)} · решта ${money(budget.debtAfter)} — з наступної зп` : `${money(budget.debt)} — закрито`}
            />
          )}
          <Row
            label="відкласти"
            value={minus(budget.savings)}
            tone="gold"
            sub={budget.savings < budget.savingsTarget ? `ціль ${money(budget.savingsTarget)}${budget.debt > 0 ? " — після мінуса" : ""}` : undefined}
          />
          {budget.surplus > 0 && <Row label="понад план" value={money(budget.surplus)} tone="ok" />}
        </Fold>
        <Button style={s.inBlock} kind="secondary" title={budget.incomeKnown ? "зп інша?" : "прийшла зп"} onPress={() => setSalary("")} />
      </Card>

      {(saved > 0 || series.length > 0) && (
        <Card title="відкладено й серії" divided>
          {saved > 0 && <Row label="у банках" value={money(saved)} tone="gold" strong />}
          {series.map((x) => (
            <Row key={x.key} label={x.label} tone="gold" value={x.days >= 7 ? "серія" : undefined} />
          ))}
        </Card>
      )}

      <Card title="бюджети до зп" divided>
        {attention.length > 0 && attention.length <= 3 && attention.map(budgetRow)}
        {attention.length > 3 && (
          <Fold label={`${attention.length} потребують уваги`} value={overSum ? minus(overSum) : undefined} tone={overSum ? "bad" : "warn"}>
            {attention.map(budgetRow)}
          </Fold>
        )}
        {calm.length > 0 && (
          <Fold label={attention.length ? `ще ${calm.length} у нормі` : `усі ${calm.length} у нормі`} tone={attention.length ? undefined : "ok"}>
            {calm.map(budgetRow)}
          </Fold>
        )}
      </Card>

      {groups.length > 0 && (
        <Card>
          <Fold label="що купую · з чеків" value={money(groups.reduce((a, g) => a + g.total, 0))}>
            {groups.slice(0, 8).map((g) => (
              <Row key={g.group} label={g.group.toLowerCase()} value={money(g.total)} />
            ))}
          </Fold>
        </Card>
      )}

      <Card>
        <Fold label="рахунки" value={money(ownTotal)} tone={ownTotal < 0 ? "bad" : undefined}>
          {accounts.map((a) => (
            <Row key={a.id} label={names.get(a.id) ?? a.name} value={money(a.own)} bad={a.own < 0} />
          ))}
        </Fold>
      </Card>

      <Sheet title={editing ? editing.name : ""} visible={!!editing} onClose={() => setEditing(null)}>
        {editing && (
          <>
            <Field label="ліміт на місяць, ₴" keyboardType="numeric" autoFocus value={editing.value} onChangeText={(value) => setEditing({ ...editing, value })} />
            <Button
              title="зберегти"
              disabled={!(Number(editing.value) >= 0)}
              onPress={() => {
                const b = budget.budgets.find((x) => x.id === editing.id)!;
                const prev = Math.round(b.limitUah / (budget.scale || 1));
                setBudgetLimit(editing.id, Math.round(Number(editing.value) * 100));
                setEditing(null);
                bump();
                updateWidget();
                haptic.ok();
                toast(`ліміт «${editing.name.toLowerCase()}» → ${editing.value} ₴`, {
                  action: { label: "повернути", run: () => (setBudgetLimit(editing.id, prev), bump(), updateWidget()) },
                });
              }}
            />
          </>
        )}
      </Sheet>

      <Sheet title="скільки прийшло" visible={salary !== null} onClose={() => setSalary(null)}>
        <Field style={{ fontSize: T.title }} keyboardType="decimal-pad" autoFocus placeholder="0" value={salary ?? ""} onChangeText={setSalary} />
        <Button
          title="розписати"
          disabled={!(Number((salary ?? "").replace(",", ".")) > 0)}
          onPress={async () => {
            await paydayPlan(Math.round(Number((salary ?? "").replace(",", ".")) * 100), Date.now());
            setSalary(null);
            bump();
            updateWidget();
            haptic.ok();
            toast("зп розписано — деталі в сповіщенні");
          }}
        />
      </Sheet>
    </ScrollView>
  );
}
