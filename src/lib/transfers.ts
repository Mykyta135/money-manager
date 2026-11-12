import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { accounts, syncState, transactions } from "@/db/schema";

const MASK = /(\d{6})\*+(\d{4})/g;
const ACCOUNT_NO = /\b(26\d{12})\b/g;
const DAY = 86_400;

const normMask = (m: string) => m.replace(/(\d{6})\*+(\d{4})/, "$1****$2");
const ibanToAccountNo = (iban: string) => iban.slice(-19).replace(/^0+/, "");

/**
 * Позначає перекази між власними рахунками в різних банках — це не дохід і не витрата.
 * 1) в описі є номер моєї картки (555555****0000) або рахунку (26000000000000) з ІНШОГО мого рахунку;
 * 2) пара "пішло з одного мого рахунку → прийшло на інший" з тією ж сумою (±1.5% комісії) за ≤3 дні.
 */
export function markOwnTransfers() {
  const ids = new Set([...byReference(), ...byPairs()]);
  const list = [...ids];
  for (let i = 0; i < list.length; i += 500) {
    db.update(transactions)
      .set({ isTransfer: true })
      .where(inArray(transactions.id, list.slice(i, i + 500)))
      .run();
  }
  return list.length;
}

function byReference() {
  const own = new Map<string, string>();
  for (const a of db.select().from(accounts).all()) {
    for (const m of a.cardMasks ?? []) own.set(normMask(m), a.id);
    if (a.iban) own.set(ibanToAccountNo(a.iban), a.id);
  }
  if (own.size === 0) return [];

  return db
    .select()
    .from(transactions)
    .where(eq(transactions.isTransfer, false))
    .all()
    .filter((t) => {
      const text = `${t.description} ${t.raw ?? ""}`;
      const refs = [
        ...[...text.matchAll(MASK)].map((m) => `${m[1]}****${m[2]}`),
        ...[...text.matchAll(ACCOUNT_NO)].map((m) => m[1]),
        ...(t.counterIban ? [ibanToAccountNo(t.counterIban)] : []),
      ];
      return refs.some((r) => {
        const owner = own.get(r);
        return owner !== undefined && owner !== t.accountId;
      });
    })
    .map((t) => t.id);
}

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z", и: "y", і: "i", ї: "i",
  й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh",
  ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia",
};
const translit = (s: string) => [...s.toLowerCase()].map((c) => TRANSLIT[c] ?? c).join("");

/** Ознака, що контрагент — я сам: моє ім'я (кирилицею чи латиницею) або поповнення через MONODirect */
function selfMatcher() {
  const row = db.select().from(syncState).where(eq(syncState.key, "mono:ownerName")).get();
  const name = row ? (JSON.parse(row.value) as string) : "";
  const surname = name.split(/\s+/)[0]?.toLowerCase();
  const variants = surname ? [surname, translit(surname)] : [];
  return (text: string) => /monodirect/i.test(text) || variants.some((v) => text.toLowerCase().includes(v));
}

function byPairs() {
  const isP2p = (category: string) => category === "Перекази" || category === "Фінансові послуги";
  const isSelf = selfMatcher();
  const all = db.select().from(transactions).all().filter((t) => isP2p(t.category) || t.isTransfer);
  const used = new Set<string>();
  const found: string[] = [];

  // Вихідні, вже позначені як "між своїми" (напр. по номеру картки), шукають свою вхідну половинку
  const outgoing = all.filter((t) => t.amount <= -10_000).sort((a, b) => a.time - b.time);
  const incoming = all.filter((t) => t.amount > 0);

  for (const out of outgoing) {
    const sum = -out.amount;
    const match = incoming.find(
      (inc) =>
        !used.has(inc.id) &&
        inc.accountId !== out.accountId &&
        Math.abs(inc.time - out.time) <= 3 * DAY &&
        inc.amount <= sum &&
        inc.amount >= sum * 0.985 &&
        (out.isTransfer || inc.isTransfer || isSelf(`${out.description} ${out.raw}`) || isSelf(inc.description)),
    );
    if (!match) continue;
    used.add(match.id);
    if (!out.isTransfer) found.push(out.id);
    if (!match.isTransfer) found.push(match.id);
  }
  return found;
}
