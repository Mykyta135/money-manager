// Регресія на реальних даних (тільки локально: data/ та imports/ не в git).
// Якщо файлів нема — тести пропускаються.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { categorize } from "@/lib/categories";
import { parseUkrsibText } from "@/lib/importers/ukrsib";
import { detectSubscriptions } from "@/lib/subscriptions";

const ROOT = path.resolve(__dirname, "../..");
const DB = path.join(ROOT, "data", "money.db");
const pdf = existsSync(path.join(ROOT, "imports")) ? readdirSync(path.join(ROOT, "imports")).find((f) => /^ukrsib.*\.pdf$/.test(f)) : undefined;

describe.skipIf(!pdf)("виписка Укрсибу (PDF)", () => {
  const text = pdf ? execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", path.join(ROOT, "imports", pdf), "-"], { encoding: "utf8", maxBuffer: 64 << 20 }) : "";
  const st = pdf ? parseUkrsibText(text) : null;

  it("суми по кожній секції сходяться з банківськими «Разом»", () => {
    // «Разом списання/поповнень» друкуються після кожної секції: рахунок, картка 1, картка 2…
    const totals = [...text.matchAll(/Разом (списання коштів|поповнень)\s+(-?[\d ]+\.\d{2})/g)].map((m) => Math.round(Number(m[2].replace(/ /g, "")) * 100));
    const sections = new Map<string, { debit: number; credit: number }>();
    for (const r of st!.rows) {
      const raw = r.raw as { section: string; card: string | null };
      const key = raw.card ?? raw.section;
      const s = sections.get(key) ?? { debit: 0, credit: 0 };
      if (r.amount < 0) s.debit += r.amount;
      else s.credit += r.amount;
      sections.set(key, s);
    }
    const parsed = [...sections.values()].flatMap((s) => [s.debit, s.credit]);
    expect(parsed).toEqual(totals.slice(0, parsed.length));
  });

  it("борг і доступна сума з шапки", () => {
    expect(st!.account.iban).toMatch(/^UA\d{27}$/);
    expect(st!.account.debt).toBeGreaterThanOrEqual(0);
  });
});

describe.skipIf(!existsSync(DB))("база на Mac", () => {
  const db = existsSync(DB) ? new Database(DB, { readonly: true }) : null;
  type Row = { time: number; amount: number; description: string; category: string; mcc: number | null; is_transfer: number };
  const rows = db ? (db.prepare("select time, amount, description, category, mcc, is_transfer from transactions").all() as Row[]) : [];

  it("правила категорій дають ті самі суми, що й раніше (снапшот)", () => {
    // Фіксований період, щоб нові операції не ламали снапшот
    const from = Math.floor(new Date(2025, 10, 1).getTime() / 1000);
    const to = Math.floor(new Date(2026, 10, 1).getTime() / 1000);
    const totals: Record<string, number> = {};
    for (const r of rows) {
      if (r.time < from || r.time >= to || r.amount >= 0 || r.is_transfer) continue;
      const c = categorize(r.mcc, r.description);
      totals[c] = (totals[c] ?? 0) - r.amount;
    }
    expect(Object.fromEntries(Object.entries(totals).sort())).toMatchSnapshot();
  });

  it("сторож підписок знаходить відомі підписки", () => {
    const subs = detectSubscriptions(
      rows.map((r) => ({ ...r, isTransfer: !!r.is_transfer })),
      Math.floor(new Date(2026, 10, 2).getTime() / 1000),
    );
    const names = subs.map((s) => s.name.toLowerCase()).join(" | ");
    for (const expected of ["anthropic", "googleone", "telegram"]) expect(names).toContain(expected);
  });

  it("усі розстрочки мають коректний графік (платежі > 0, строк > 0)", () => {
    const loans = db!.prepare("select monthly_payment, term_months, start_date from loans").all() as { monthly_payment: number; term_months: number; start_date: string }[];
    expect(loans.length).toBeGreaterThan(0);
    for (const l of loans) {
      expect(l.monthly_payment).toBeGreaterThan(0);
      expect(l.term_months).toBeGreaterThan(0);
      expect(l.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
