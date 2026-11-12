import { Card } from "@/components/ui";
import { importers } from "@/lib/importers";
import { ImportForm } from "./import-form";

export default function ImportPage() {
  const options = Object.values(importers).map((i) => ({ bank: i.bank, label: i.label, accept: i.accept }));
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Імпорт виписки</h1>
      <Card>
        <ImportForm options={options} />
        <p className="mt-4 text-xs text-muted">
          Моно підтягується автоматично через API. Повторний імпорт тієї ж виписки дублів не створює.
        </p>
      </Card>
    </div>
  );
}
