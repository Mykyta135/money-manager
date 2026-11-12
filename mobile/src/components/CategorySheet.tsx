import { Text } from "react-native";
import type { Transaction } from "@/db/schema";
import { formatMoney } from "@/lib/format";
import { allCategories } from "@m/lib/data";
import { itemsFor } from "@m/lib/receipts";
import { haptic, Row, s, Sheet } from "@m/ui";

const money = (v: number) => formatMoney(v).replace(" ₴", "");

/** Шторка операції: товари з чека (якщо є) і вибір категорії */
export function CategorySheet({ tx, onPick, onClose }: { tx: Transaction | null; onPick: (category: string) => void; onClose: () => void }) {
  return (
    <Sheet title={tx?.description ?? ""} visible={!!tx} onClose={onClose}>
      {tx && (
        <>
          {itemsFor(tx.id).map((i) => (
            <Row key={i.id} label={i.name} sub={i.itemGroup.toLowerCase()} value={money(i.total)} />
          ))}
          <Text style={s.sublabel}>категорія</Text>
          {/* поточна — першою, далі решта за абеткою */}
          {[tx.category, ...allCategories().filter((c) => c !== tx.category)].map((c) => (
            <Row key={c} label={c.toLowerCase()} value={c === tx.category ? "зараз" : undefined} tone={c === tx.category ? "ok" : undefined} onPress={() => (haptic.tap(), onPick(c))} />
          ))}
        </>
      )}
    </Sheet>
  );
}
