import { Children, Fragment, isValidElement, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  LayoutAnimation,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { create } from "zustand";
import { C, E, GUTTER, MOTION, R, S, T } from "./tokens";

// Дизайн-система «квитанція × моно»: чорний фон, підняті блоки з тінню, цифри табличні праворуч,
// одна біла кнопка на екран. Колір — тільки стани й золото, завжди разом з текстом.
// Усі числа в стилях — з tokens.ts.

export { C, E, GUTTER, R, S, T } from "./tokens";

/** Тактильний відгук: легкий клік, успіх, помилка */
export const haptic = {
  tap: () => void Haptics.selectionAsync().catch(() => {}),
  ok: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  bad: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
};

/** Плавна зміна розкладки (розгорнути блок, прибрати рядок) */
export const animateLayout = () => LayoutAnimation.configureNext(LayoutAnimation.create(MOTION.base, "easeInEaseOut", "opacity"));

/** Після синку/імпорту бампаємо версію — екрани перечитують БД */
export const useDataVersion = create<{ v: number; bump: () => void }>((set) => ({
  v: 0,
  bump: () => set((s) => ({ v: s.v + 1 })),
}));

/** Синхронне читання з SQLite; підписка на версію даних перерендерює екран після синку/імпорту */
export function useDb<T>(read: () => T): T {
  useDataVersion((st) => st.v);
  return read();
}

/** Відступ зверху для екранів без заголовка (модалки, головна) — під статус-бар */
export function useTopInset() {
  return useSafeAreaInsets().top + S.lg;
}

// ---- Тост: короткий підсумок дії + «скасувати» ----

type ToastMsg = { id: number; text: string; tone?: Tone; action?: { label: string; run: () => void }; duration?: number };

const useToastStore = create<{ msg: ToastMsg | null; show: (m: Omit<ToastMsg, "id">) => void; hide: () => void }>((set) => ({
  msg: null,
  show: (m) => set({ msg: { ...m, id: Date.now() } }),
  hide: () => set({ msg: null }),
}));

/** Показати тост. action — напр. { label: "скасувати", run: undo } */
export function toast(text: string, opts: Omit<ToastMsg, "id" | "text"> = {}) {
  useToastStore.getState().show({ text, ...opts });
}

/** Один на всю апку — у кореневому layout. bottom — щоб не перекривати таб-бар */
export function ToastHost({ bottom }: { bottom: number }) {
  const msg = useToastStore((st) => st.msg);
  const hide = useToastStore((st) => st.hide);
  const [y] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!msg) return;
    y.setValue(0);
    Animated.spring(y, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
    const t = setTimeout(() => Animated.timing(y, { toValue: 0, duration: MOTION.fast, useNativeDriver: true }).start(hide), msg.duration ?? MOTION.toast);
    return () => clearTimeout(t);
  }, [msg, y, hide]);

  if (!msg) return null;
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[s.toast, { bottom, opacity: y, transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [S.xl, 0] }) }] }]}
    >
      <Text style={[s.text, { flex: 1 }, msg.tone && { color: C[msg.tone] }]}>{msg.text}</Text>
      {msg.action && (
        <Pressable
          hitSlop={S.md}
          onPress={() => {
            haptic.tap();
            msg.action!.run();
            hide();
          }}
        >
          <Text style={[s.text, s.strong]}>{msg.action.label}</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

// ---- Блоки й рядки ----

/**
 * Секція: підпис над піднятим блоком. divided — тонкі розділювачі між дітьми.
 * Не-рядкові діти (кнопки, поля) мають власні відступи через s.inBlock.
 */
export function Card({
  title,
  aside,
  children,
  style,
  divided,
}: {
  title?: string;
  aside?: string; // праворуч від підпису, напр. сума дня
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  divided?: boolean;
}) {
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[s.section, style]}>
      {(title || aside) && (
        <View style={s.row}>
          <Text style={s.label}>{title}</Text>
          {aside && <Text style={[s.label, s.num, { color: C.muted, fontSize: T.caption }]}>{aside}</Text>}
        </View>
      )}
      <View style={s.block}>
        {divided
          ? items.map((child, i) => (
              <Fragment key={child.key ?? i}>
                {i > 0 && <Divider />}
                {child}
              </Fragment>
            ))
          : children}
      </View>
    </View>
  );
}

export type Tone = "ok" | "warn" | "bad" | "gold";

/** Стан бюджету: до 80% — без кольору, 80–100% — увага, понад — перевитрата */
export function budgetTone(spent: number, limit: number): Tone | undefined {
  if (spent > limit) return "bad";
  if (limit > 0 && spent >= limit * 0.8) return "warn";
  return undefined;
}

/** Рядок квитанції: назва ліворуч, сума праворуч табличними цифрами */
export function Row({
  label,
  value,
  sub,
  bad,
  tone,
  strong,
  chevron,
  onPress,
  onLongPress,
}: {
  label: string;
  value?: string;
  sub?: string;
  bad?: boolean;
  tone?: Tone;
  strong?: boolean;
  chevron?: "down" | "up" | "right";
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const content = (
    <View style={s.rowLine}>
      <View style={{ flex: 1, gap: S.xxs }}>
        <Text style={[s.text, strong && s.strong]} numberOfLines={1}>
          {label}
        </Text>
        {sub ? <Text style={s.muted}>{sub}</Text> : null}
      </View>
      {value !== undefined && <Text style={[s.num, strong && s.strong, (tone || bad) && { color: C[tone ?? "bad"] }]}>{value}</Text>}
      {chevron && <Ionicons name={chevron === "right" ? "chevron-forward" : `chevron-${chevron}`} size={T.small} color={C.muted} />}
    </View>
  );
  if (!onPress && !onLongPress) return content;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress && (() => (haptic.tap(), onLongPress()))}
      android_ripple={{ color: C.ripple, foreground: true }}
      style={s.pressRow}
    >
      {content}
    </Pressable>
  );
}

/** Згорнутий блок: рядок-підсумок, тап плавно розгортає деталі */
export function Fold({ children, initial = false, ...row }: Omit<Parameters<typeof Row>[0], "onPress" | "chevron"> & { children: ReactNode; initial?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <View>
      <Row
        {...row}
        chevron={open ? "up" : "down"}
        onPress={() => {
          haptic.tap();
          animateLayout();
          setOpen(!open);
        }}
      />
      {open && <View style={s.foldBody}>{children}</View>}
    </View>
  );
}

const SWIPE = 90;

/**
 * Рядок зі свайпом: вправо — onRight (напр. «ок»), вліво — onLeft (напр. змінити категорію).
 * Вертикальний скрол не перехоплює — реагує тільки на явно горизонтальний рух.
 */
export function SwipeRow({ children, onRight, onLeft, rightLabel, leftLabel }: { children: ReactNode; onRight: () => void; onLeft: () => void; rightLabel: string; leftLabel: string }) {
  const [x] = useState(() => new Animated.Value(0));
  // жест не перерендерює рядок (x анімується напряму), тож перестворення між жестами безпечне
  const responder = useMemo(() => {
    const gesture = { armed: 0 }; // стан жесту живе в об'єкті, а не в змінній замикання
    const back = () => Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > S.md && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => {
        x.setValue(g.dx);
        const next = g.dx > SWIPE ? 1 : g.dx < -SWIPE ? -1 : 0;
        if (next !== gesture.armed) {
          gesture.armed = next;
          if (next) haptic.tap();
        }
      },
      onPanResponderRelease: () => {
        const a = gesture.armed;
        gesture.armed = 0;
        if (a === 1) Animated.timing(x, { toValue: 600, duration: MOTION.fast, useNativeDriver: true }).start(() => onRight());
        else {
          back();
          if (a === -1) onLeft();
        }
      },
      onPanResponderTerminate: () => ((gesture.armed = 0), back()),
    });
  }, [x, onRight, onLeft]);
  return (
    <View style={s.swipe}>
      <View style={[StyleSheet.absoluteFill, s.row, { paddingHorizontal: GUTTER }]}>
        <Text style={[s.text, { color: C.ok }]}>{rightLabel}</Text>
        <Text style={[s.text, { color: C.warn }]}>{leftLabel}</Text>
      </View>
      <Animated.View style={{ transform: [{ translateX: x }], backgroundColor: C.surface, paddingHorizontal: GUTTER }} {...responder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

export function Divider({ strong }: { strong?: boolean }) {
  return <View style={{ height: strong ? 1.5 : StyleSheet.hairlineWidth, backgroundColor: strong ? C.muted : C.line }} />;
}

/** Порожній стан — один рядок, без пояснень */
export function Empty({ text }: { text: string }) {
  return <Text style={[s.muted, { paddingVertical: S.md }]}>{text}</Text>;
}

// ---- Кнопки й чіпи ----

type ButtonKind = "primary" | "secondary" | "text";

/** Кнопка з пружинним натиском; loading — крутилка замість тексту */
export function Button({
  title,
  onPress,
  disabled,
  loading,
  kind = "primary",
  style,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  kind?: ButtonKind;
  style?: StyleProp<ViewStyle>;
}) {
  const [scale] = useState(() => new Animated.Value(1));
  const press = (to: number) => Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 8 }).start();
  const off = disabled || loading;
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={() => {
          if (kind === "primary") haptic.tap();
          onPress();
        }}
        onPressIn={() => press(0.97)}
        onPressOut={() => press(1)}
        disabled={off}
        android_ripple={kind === "text" ? undefined : { color: kind === "primary" ? "rgba(0,0,0,0.12)" : C.ripple, foreground: true }}
        style={({ pressed }) => [BUTTON[kind][0], disabled && { opacity: 0.35 }, kind === "text" && pressed && { opacity: 0.5 }]}
      >
        {loading ? <ActivityIndicator color={kind === "primary" ? C.bg : C.text} /> : <Text style={BUTTON[kind][1]}>{title}</Text>}
      </Pressable>
    </Animated.View>
  );
}

/** Чіп вибору: категорія, рахунок, день тижня */
export function Chip({ label, active, onPress, style }: { label: string; active?: boolean; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      onPress={() => (haptic.tap(), onPress())}
      android_ripple={{ color: C.ripple, foreground: true }}
      style={[s.chip, active && s.chipActive, style]}
    >
      <Text style={[s.text, !active && { color: C.muted }]}>{label}</Text>
    </Pressable>
  );
}

/** Поле з підписом усередині блоку */
export function Field({ label, style, ...props }: TextInputProps & { label?: string }) {
  return (
    <View style={s.field}>
      {label && <Text style={s.fieldLabel}>{label}</Text>}
      <TextInput placeholderTextColor={C.faint} {...props} style={[s.input, style]} />
    </View>
  );
}

// ---- Шторка ----

/** Нижня шторка для коротких дій: фон темнішає, шторка виїжджає з пружиною */
export function Sheet({ title, visible, onClose, children }: { title: string; visible: boolean; onClose: () => void; children: ReactNode }) {
  const [y] = useState(() => new Animated.Value(0));
  const bottom = useSafeAreaInsets().bottom;
  useEffect(() => {
    if (!visible) return;
    y.setValue(0);
    Animated.spring(y, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 4 }).start();
  }, [visible, y]);
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <Animated.View style={[s.sheet, { paddingBottom: bottom + S.lg, transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }] }]}>
        <View style={s.handle} />
        <View style={s.rowLine}>
          <Text style={[s.text, s.strong, { flex: 1 }]} numberOfLines={2}>
            {title}
          </Text>
          <Pressable onPress={onClose} hitSlop={S.md}>
            <Text style={s.muted}>закрити</Text>
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: S.xs, paddingTop: S.sm }}>
          {children}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// ---- Стилі ----

const num: TextStyle = { fontVariant: ["tabular-nums"] };

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: GUTTER, paddingTop: S.md, paddingBottom: S.xxl * 2, gap: S.xl },
  section: { gap: S.sm },
  label: { color: C.muted, fontSize: T.caption, paddingHorizontal: GUTTER },
  /** підпис групи всередині блоку чи шторки */
  sublabel: { color: C.muted, fontSize: T.caption, paddingTop: S.md, paddingBottom: S.xs },
  block: { ...E[1], borderRadius: R.lg, paddingHorizontal: GUTTER, paddingVertical: S.xs, overflow: "hidden" },
  /** Кнопка чи поле всередині блоку */
  inBlock: { marginVertical: S.md },
  foldBody: { paddingLeft: S.md, borderLeftWidth: StyleSheet.hairlineWidth, borderColor: C.line, marginBottom: S.sm },
  rowLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: S.md, paddingVertical: S.md },
  pressRow: { marginHorizontal: -GUTTER, paddingHorizontal: GUTTER },
  /** свайп-рядок на всю ширину блоку, щоб під ним було видно підказки */
  swipe: { marginHorizontal: -GUTTER },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: S.md },
  text: { color: C.text, fontSize: T.body },
  strong: { fontWeight: "700" },
  muted: { color: C.muted, fontSize: T.small },
  num: { ...num, color: C.text, fontSize: T.body, fontWeight: "500" },
  big: { color: C.text, fontSize: T.display, fontWeight: "800", letterSpacing: -1.5, fontVariant: ["tabular-nums"] },
  title: { color: C.text, fontSize: T.title, fontWeight: "700" },
  hero: { ...E[2], marginHorizontal: -GUTTER, marginTop: -S.md, paddingHorizontal: GUTTER, paddingBottom: S.xl, gap: S.xs, borderBottomLeftRadius: R.xl, borderBottomRightRadius: R.xl },
  primary: { backgroundColor: C.text, borderRadius: R.pill, paddingVertical: S.md + S.xxs, paddingHorizontal: S.xl, alignItems: "center", overflow: "hidden", boxShadow: "0 6px 16px -6px rgba(242,241,237,0.25)" },
  primaryText: { color: C.bg, fontWeight: "700", fontSize: T.body },
  secondary: { borderRadius: R.pill, paddingVertical: S.md, paddingHorizontal: S.xl, alignItems: "center", borderWidth: 1, borderColor: C.faint, overflow: "hidden" },
  secondaryText: { color: C.text, fontSize: T.body },
  text_: { paddingVertical: S.sm },
  textText: { color: C.muted, fontSize: T.body },
  chip: { borderRadius: R.pill, borderWidth: 1, borderColor: C.line, paddingVertical: S.sm, paddingHorizontal: S.md + S.xxs, overflow: "hidden" },
  chipActive: { borderColor: C.text, backgroundColor: C.raised },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: S.sm },
  field: { paddingVertical: S.sm, gap: S.xxs },
  fieldLabel: { color: C.muted, fontSize: T.caption },
  input: { borderBottomWidth: 1, borderColor: C.faint, paddingVertical: S.sm + S.xxs, color: C.text, fontSize: T.input },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: { ...E[3], maxHeight: "80%", borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, paddingHorizontal: GUTTER + S.xs, paddingTop: S.sm },
  handle: { alignSelf: "center", width: 36, height: S.xs, borderRadius: R.pill, backgroundColor: C.faint, marginBottom: S.sm },
  toast: { ...E[3], position: "absolute", left: GUTTER, right: GUTTER, flexDirection: "row", alignItems: "center", gap: S.lg, borderRadius: R.md, paddingVertical: S.md, paddingHorizontal: GUTTER },
});

const BUTTON: Record<ButtonKind, [ViewStyle, TextStyle]> = {
  primary: [s.primary, s.primaryText],
  secondary: [s.secondary, s.secondaryText],
  text: [s.text_, s.textText],
};
