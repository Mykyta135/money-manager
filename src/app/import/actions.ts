"use server";

import { refresh } from "next/cache";
import { importers, saveStatement } from "@/lib/importers";

export type ImportResult = { ok: true; message: string } | { ok: false; message: string } | null;

export async function importStatement(_prev: ImportResult, form: FormData): Promise<ImportResult> {
  const importer = importers[String(form.get("bank"))];
  const file = form.get("file");
  if (!importer) return { ok: false, message: "Невідомий банк" };
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Обери файл" };

  try {
    const parsed = importer.parse(Buffer.from(await file.arrayBuffer()), file.name);
    const r = saveStatement(importer.bank, parsed);
    refresh();
    return { ok: true, message: `Знайдено ${r.total}, додано ${r.inserted}, дублікатів ${r.skipped}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
