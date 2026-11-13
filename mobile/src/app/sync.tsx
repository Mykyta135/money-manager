import { useCallback, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { localSyncHost } from "@/lib/sync-url";
import { snapshot } from "@m/lib/data";
import { importFromUrl } from "@m/lib/importer";
import { Button, C, Card, haptic, s, useDataVersion, useTopInset } from "@m/ui";
import { updateWidget } from "@m/widget/update";

// money://sync?mode=import|backup&url=… — відкривається командою `npm run phone:push|pull` на ноутбуці.
// Будь-який застосунок чи сайт може відкрити deep link, тому: тільки адреса в локальній мережі
// і синк лише після натискання кнопки, з показаним хостом.

export default function Sync() {
  const { mode, url } = useLocalSearchParams<{ mode?: string; url?: string }>();
  const bump = useDataVersion((st) => st.bump);
  const top = useTopInset();
  const host = localSyncHost(url);
  const known = mode === "import" || mode === "backup";
  const [status, setStatus] = useState(
    !url ? "нема адреси" : !host ? "адреса не в локальній мережі — синк заблоковано" : !known ? `невідомий режим ${mode}` : "чекаю підтвердження",
  );

  const start = useCallback(() => {
    if (!url || !host || !known) return;
    setStatus("синхронізую…");
    const run = async () => {
      if (mode === "import") {
        const r = await importFromUrl(url);
        return `з ноутбука: операцій ${r.transactions}, розстрочок ${r.loans}, бюджетів ${r.budgets}`;
      }
      if (mode === "backup") {
        const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(snapshot()) });
        if (!res.ok) throw new Error(`ноутбук відповів ${res.status}`);
        return "бекап на ноутбуці";
      }
      throw new Error(`невідомий режим ${mode}`);
    };
    run()
      .then((m) => {
        setStatus(m);
        bump();
        updateWidget();
        haptic.ok();
        setTimeout(() => router.replace("/"), 1500); // успіх — сам повертаюсь на головну
      })
      .catch((e) => setStatus(`помилка: ${String(e)}`));
  }, [mode, url, host, known, bump]);

  const blocked = !host || !known;
  return (
    <View style={[s.screen, s.content, { paddingTop: top }]}>
      <Text style={s.title}>синк</Text>
      <Card>
        <View style={[s.row, s.inBlock, { justifyContent: "flex-start" }]}>
          {status === "синхронізую…" && <ActivityIndicator color={C.text} />}
          <Text style={[s.text, (status.startsWith("помилка") || blocked) && { color: C.bad }]}>{status}</Text>
        </View>
      </Card>
      {status === "чекаю підтвердження" && (
        <Button
          title={mode === "backup" ? `надіслати бекап на ${host}` : `замінити дані з ${host}`}
          onPress={start}
        />
      )}
      <Button title="готово" onPress={() => router.replace("/")} />
    </View>
  );
}
