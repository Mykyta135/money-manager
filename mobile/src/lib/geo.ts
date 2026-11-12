import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { formatMoney } from "@/lib/format";
import { currentBudget } from "./data";
import { notify } from "./notify";
import { getState, setState } from "./state";

// Геонагадування: заходиш у «небезпечне» місце (Сімі маркет) → пуш, скільки лишилось у бюджеті.
// Координати лишаються тільки на телефоні.

export const GEO_TASK = "money-geofence";
const RADIUS_M = 120;
const COOLDOWN_MS = 3 * 3600_000;

export type Place = { id: string; name: string; budgetId: string; latitude: number; longitude: number };

export const places = () => getState<Place[]>("geo:places") ?? [];

TaskManager.defineTask<{ eventType: Location.GeofencingEventType; region: Location.LocationRegion }>(GEO_TASK, async ({ data, error }) => {
  if (error || !data || data.eventType !== Location.GeofencingEventType.Enter) return;
  const place = places().find((p) => p.id === data.region.identifier);
  if (!place) return;
  const lastKey = `geo:last:${place.id}`;
  if (Date.now() - (getState<number>(lastKey) ?? 0) < COOLDOWN_MS) return;
  setState(lastKey, Date.now());

  const b = currentBudget();
  const budget = b.budgets.find((x) => x.id === place.budgetId);
  const left = budget ? `«${budget.name}»: лишилось ${formatMoney(Math.max(0, budget.left))} до ЗП` : "";
  await notify("spend", place.name, `${left}\nСьогодні можна ще ${formatMoney(b.safeToday)}. Точно треба?`);
});

async function restart() {
  const list = places();
  if (await TaskManager.isTaskRegisteredAsync(GEO_TASK)) await Location.stopGeofencingAsync(GEO_TASK);
  if (list.length === 0) return;
  await Location.startGeofencingAsync(
    GEO_TASK,
    list.map((p) => ({ identifier: p.id, latitude: p.latitude, longitude: p.longitude, radius: RADIUS_M, notifyOnEnter: true, notifyOnExit: false })),
  );
}

/** «Я зараз тут» → запам'ятати місце. Потрібен доступ до геолокації «Завжди» */
export async function addPlaceHere(name: string, budgetId: string) {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) throw new Error("Нема доступу до геолокації");
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (!bg.granted) throw new Error("Для нагадувань потрібен доступ до геолокації «Дозволяти завжди»");
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const place: Place = { id: `place-${Date.now()}`, name, budgetId, latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  setState("geo:places", [...places(), place]);
  await restart();
  return place;
}

export async function removePlace(id: string) {
  setState("geo:places", places().filter((p) => p.id !== id));
  await restart();
}
