import { useRef, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { extractTextFromImage } from "expo-text-extractor";
import { router } from "expo-router";
import { formatMoney } from "@/lib/format";
import { itemGroup, parseReceiptLines, type ParsedItem } from "@/lib/items";
import { guessTransaction, saveReceipt } from "@m/lib/receipts";
import { setState } from "@m/lib/state";
import { Button, C, Card, Chip, haptic, R, Row, S, s, toast, useDataVersion, useTopInset } from "@m/ui";

// Чек: QR податкової (прив'язка до операції) або фото → розпізнавання тексту на телефоні → товари

type Mode = "photo" | "qr";

function parseQr(data: string) {
  try {
    const u = new URL(data);
    const sm = Number((u.searchParams.get("sm") ?? "").replace(",", "."));
    return sm > 0 ? { url: data, sum: Math.round(sm * 100) } : null;
  } catch {
    return null;
  }
}

export default function Receipt() {
  const bump = useDataVersion((st) => st.bump);
  const top = useTopInset();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const scanned = useRef(false); // сканер шле той самий QR десятки разів — беремо перший
  const [mode, setMode] = useState<Mode>("photo");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<ParsedItem[] | null>(null);
  const [store, setStore] = useState("Сільпо");

  if (!permission) return <View style={s.screen} />;
  if (!permission.granted) {
    return (
      <View style={[s.screen, s.content, { paddingTop: top }]}>
        <Text style={s.title}>чек</Text>
        <Text style={s.text}>потрібен доступ до камери</Text>
        <Button title="дозволити камеру" onPress={requestPermission} />
      </View>
    );
  }

  const shoot = async () => {
    setBusy(true);
    try {
      const photo = await camera.current?.takePictureAsync({ quality: 0.9 });
      if (!photo) return;
      const parsed = parseReceiptLines(await extractTextFromImage(photo.uri));
      if (parsed.length === 0) {
        haptic.bad();
        toast("не розібрав товари — ближче й рівніше, при світлі", { tone: "bad" });
      } else setItems(parsed);
    } catch (e) {
      toast(String(e), { tone: "bad" });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!items) return;
    const total = items.reduce((a, i) => a + i.total, 0);
    const tx = guessTransaction(total);
    await saveReceipt(store.trim() || "Магазин", tx?.id ?? null, items);
    bump();
    haptic.ok();
    toast(`збережено ${items.length} товарів · ${formatMoney(total)}${tx ? ` → ${tx.description}` : ""}`);
    router.back();
  };

  // Перегляд розпізнаних товарів перед збереженням; тап по товару — прибрати хибний рядок
  if (items) {
    const total = items.reduce((a, i) => a + i.total, 0);
    return (
      <ScrollView style={s.screen} contentContainerStyle={[s.content, { paddingTop: top }]}>
        <Text style={s.title}>
          {items.length} товарів · {formatMoney(total)}
        </Text>
        <Card title="магазин">
          <TextInput style={s.input} value={store} onChangeText={setStore} />
        </Card>
        <Card title="товари · тап — прибрати" divided>
          {items.map((i, idx) => (
            <Row
              key={idx}
              label={i.name}
              sub={`${itemGroup(i.name).toLowerCase()}${i.qty !== 1 ? ` · ${i.qty} × ${formatMoney(i.unitPrice)}` : ""}`}
              value={formatMoney(i.total)}
              onPress={() => setItems(items.filter((_, k) => k !== idx))}
            />
          ))}
        </Card>
        <Button title="зберегти" onPress={save} />
        <Button kind="text" title="перезняти" onPress={() => setItems(null)} />
      </ScrollView>
    );
  }

  return (
    <View style={s.screen}>
      <CameraView
        ref={camera}
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={mode === "qr" ? { barcodeTypes: ["qr"] } : undefined}
        onBarcodeScanned={
          mode === "qr"
            ? ({ data }) => {
                if (scanned.current) return;
                const qr = parseQr(data);
                if (!qr) return;
                scanned.current = true;
                const tx = guessTransaction(qr.sum);
                if (tx) setState(`receipt:${tx.id}`, qr.url);
                haptic.ok();
                toast(`чек ${formatMoney(qr.sum)}${tx ? ` → ${tx.description}` : " збережено"}`);
                router.back();
              }
            : undefined
        }
      />
      <View style={[s.content, { backgroundColor: C.raised, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, marginTop: -S.xl, gap: S.md }]}>
        <View style={{ flexDirection: "row", gap: S.sm }}>
          {(["photo", "qr"] as const).map((m) => (
            <Chip key={m} label={m === "photo" ? "фото" : "qr"} active={mode === m} onPress={() => setMode(m)} style={{ flex: 1, alignItems: "center" }} />
          ))}
        </View>
        {mode === "photo" ? <Button title="сфотографувати" loading={busy} onPress={shoot} /> : <Text style={[s.muted, { textAlign: "center" }]}>qr внизу чека</Text>}
        <Button kind="text" title="закрити" onPress={() => router.back()} />
      </View>
    </View>
  );
}
