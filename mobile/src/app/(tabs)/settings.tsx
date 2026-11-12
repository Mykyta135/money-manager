import { useEffect, useState } from "react";
import BankPush from "../../../modules/bank-push/src/BankPushModule";
import { ScrollView, Text, View } from "react-native";
import * as IntentLauncher from "expo-intent-launcher";
import * as SecureStore from "expo-secure-store";
import { shareBackup } from "@m/lib/backup";
import { importFromMac } from "@m/lib/importer";
import { notify } from "@m/lib/notify";
import { processPushes, type BankPushEvent } from "@m/lib/pushes";
import { settings } from "@m/lib/data";
import { addPlaceHere, places, removePlace } from "@m/lib/geo";
import { groceryPlan } from "@m/lib/calendar";
import { getState, setState } from "@m/lib/state";
import { syncStep, TOKEN_KEY } from "@m/lib/sync";
import { checkForUpdate, DEFAULT_UPDATE_URL, installedVersion, useUpdate } from "@m/lib/update";
import { UpdateBanner } from "@m/components/UpdateBanner";
import { Button, Card, Chip, Divider, Field, Fold, haptic, Row, S, s, T, toast, useDataVersion } from "@m/ui";

const WEEKDAYS = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];
const DEFAULT_MAC = "http://192.168.0.106:3001";

export default function Settings() {
  const bump = useDataVersion((st) => st.bump);
  const [token, setToken] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [macUrl, setMacUrl] = useState(getState<string>("mac:url") ?? "");
  const [updUrl, setUpdUrl] = useState(getState<string>("update:url") ?? "");
  const [exportToken, setExportToken] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // яка дія зараз виконується
  const lastRun = getState<{ at: number; result: string }>("bg:lastRun");
  const [pushOn, setPushOn] = useState(() => BankPush.isEnabled());
  const recentPushes = getState<BankPushEvent[]>("push:recent") ?? [];
  const [payday, setPayday] = useState(String(settings.paydayDay()));
  const [savings, setSavings] = useState(String(settings.savings() / 100));
  const [placeName, setPlaceName] = useState("Сімі маркет");
  const [grocery, setGrocery] = useState(() => ({ weekday: groceryPlan().weekday, amount: String(groceryPlan().amount / 100) }));
  const savedPlaces = places();

  useEffect(() => {
    SecureStore.getItemAsync(TOKEN_KEY).then((t) => setHasToken(!!t));
  }, []);

  /** Дія з крутилкою на кнопці й тостом з результатом */
  const run = async (key: string, fn: () => Promise<string>, duration?: number) => {
    setBusy(key);
    try {
      const msg = await fn();
      haptic.ok();
      toast(msg, { duration });
      bump();
    } catch (e) {
      haptic.bad();
      toast(String(e), { tone: "bad" });
    } finally {
      setBusy(null);
    }
  };

  const last = lastRun
    ? `${new Date(lastRun.at).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · ${lastRun.result}`
    : "ще не було";
  const salaryValid = Number(payday) >= 1 && Number(payday) <= 28 && Number(savings) >= 0;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Card title="банки">
        <Row label="моно" value={hasToken ? "підключено" : "нема токена"} tone={hasToken ? "ok" : undefined} />
        {!hasToken && (
          <>
            <Field value={token} onChangeText={setToken} placeholder="токен з api.monobank.ua" autoCapitalize="none" secureTextEntry />
            <Button
              style={s.inBlock}
              title="зберегти токен"
              disabled={!token}
              onPress={async () => {
                await SecureStore.setItemAsync(TOKEN_KEY, token.trim());
                setToken("");
                setHasToken(true);
                toast("токен збережено");
              }}
            />
          </>
        )}
        <Divider />
        <Row
          label="пуші банків"
          value={pushOn ? "читаю" : "вимкнено"}
          tone={pushOn ? "ok" : undefined}
          chevron="right"
          onPress={() => (BankPush.openSettings(), setTimeout(() => setPushOn(BankPush.isEnabled()), 4000))}
        />
        <Divider />
        <Row label="останній синк" sub={last} />
        <Button style={s.inBlock} kind="secondary" title="синхронізувати" loading={busy === "sync"} onPress={() => run("sync", syncStep)} />
      </Card>

      <Card title="зарплата">
        <Field label="число виплати" keyboardType="numeric" value={payday} onChangeText={setPayday} />
        <Field label="відкладати з кожної зп, ₴" keyboardType="numeric" value={savings} onChangeText={setSavings} />
        <Field label="похід по продукти раз на тиждень, ₴" keyboardType="numeric" value={grocery.amount} onChangeText={(amount) => setGrocery({ ...grocery, amount })} />
        <View style={[s.chips, { paddingVertical: S.sm }]}>
          {WEEKDAYS.map((w, i) => (
            <Chip key={w} label={w} active={grocery.weekday === i} onPress={() => setGrocery({ ...grocery, weekday: i })} />
          ))}
        </View>
        <Button
          style={s.inBlock}
          kind="secondary"
          title="зберегти"
          disabled={!salaryValid}
          onPress={() => {
            setState("settings:paydayDay", Number(payday));
            setState("settings:savings", Math.round(Number(savings) * 100));
            setState("plan:groceries", { weekday: grocery.weekday, amount: Math.round(Number(grocery.amount) * 100) || 0 });
            bump();
            haptic.ok();
            toast("збережено");
          }}
        />
      </Card>

      <Card title="місця-нагадування">
        {savedPlaces.map((pl) => (
          <Row key={pl.id} label={pl.name} value="утримуй — прибрати" onLongPress={() => run(`rm${pl.id}`, async () => (await removePlace(pl.id), `прибрав «${pl.name}»`))} />
        ))}
        <Field value={placeName} onChangeText={setPlaceName} />
        <Button
          style={s.inBlock}
          kind="secondary"
          title="я тут — запам'ятати"
          disabled={!placeName.trim()}
          loading={busy === "place"}
          onPress={() => run("place", async () => `запам'ятав «${(await addPlaceHere(placeName.trim(), "snacks")).name}»`)}
        />
      </Card>

      <UpdateBanner />

      <Card title="дані" divided>
        <Row
          label={`версія ${installedVersion().name}`}
          value="перевірити"
          chevron="right"
          onPress={() =>
            run("update", async () => {
              const rel = await checkForUpdate(true);
              const err = useUpdate.getState().error;
              if (err) throw new Error(err);
              return rel ? `є версія ${rel.version}` : "встановлено найновішу";
            })
          }
        />
        <Row label="бекап бази" value="поділитися" chevron="right" onPress={() => run("backup", async () => `файл ${await shareBackup()}`)} />
        <Row
          label="батарея"
          value="не оптимізувати"
          chevron="right"
          onPress={() => IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS)}
        />
      </Card>

      <Card>
        <Fold label="для розробника">
          <View style={s.row}>
            <Button
              kind="text"
              title="тест пушу"
              onPress={() =>
                run("push", async () => {
                  BankPush.simulate("com.ftband.mono", "Сімі маркет", "−87.50 ₴\nБаланс 1 234.56 ₴");
                  return `оброблено пушів: ${await processPushes()}`;
                })
              }
            />
            <Button kind="text" title="тестове сповіщення" onPress={() => notify("spend", "−340 ₴ · Сімі маркет", "перекуси й напої 1 120 / 1 000 · сьогодні ще 180 ₴")} />
          </View>
          {recentPushes.slice(0, 5).map((e) => (
            <Text key={`${e.key}${e.at}`} style={[s.muted, { fontFamily: "monospace", fontSize: T.micro }]} selectable>
              {e.pkg.split(".").pop()} · {e.title} · {e.text.replace(/\n/g, " / ")}
            </Text>
          ))}
          <Field
            label="сервер оновлень"
            value={updUrl}
            onChangeText={setUpdUrl}
            onEndEditing={() => setState("update:url", updUrl.trim() || DEFAULT_UPDATE_URL)}
            placeholder={DEFAULT_UPDATE_URL}
            autoCapitalize="none"
          />
          <Field label="імпорт з mac" testID="mac-url" value={macUrl} onChangeText={setMacUrl} placeholder={DEFAULT_MAC} autoCapitalize="none" />
          <Field testID="export-token" value={exportToken} onChangeText={setExportToken} placeholder="export token" autoCapitalize="none" secureTextEntry />
          <Button
            style={s.inBlock}
            kind="secondary"
            title="імпортувати"
            disabled={!exportToken}
            loading={busy === "import"}
            onPress={() =>
              run(
                "import",
                async () => {
                  const url = macUrl.trim() || DEFAULT_MAC;
                  setState("mac:url", url);
                  const r = await importFromMac(url, exportToken);
                  return `операцій ${r.transactions}, розстрочок ${r.loans}, бюджетів ${r.budgets}`;
                },
                8000,
              )
            }
          />
        </Fold>
      </Card>
    </ScrollView>
  );
}
