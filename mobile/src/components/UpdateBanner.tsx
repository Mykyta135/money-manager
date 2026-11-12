import { Text, View } from "react-native";
import { installUpdate, useUpdate } from "@m/lib/update";
import { Button, Card, Row, S, s } from "@m/ui";

/** Є новіша збірка на Mac — рядок з кнопкою; під час завантаження — відсотки */
export function UpdateBanner() {
  const { available, progress, error } = useUpdate();
  if (!available) return null;
  return (
    <Card>
      <Row label={`є версія ${available.version}`} sub={available.notes} tone="gold" value={progress !== null ? `${Math.round(progress * 100)}%` : undefined} />
      {error && <Text style={[s.muted, { paddingBottom: S.sm }]}>{error}</Text>}
      <View style={s.inBlock}>
        <Button kind="secondary" title={progress !== null ? "завантажую…" : "оновити"} loading={progress !== null} onPress={() => installUpdate(available)} />
      </View>
    </Card>
  );
}
