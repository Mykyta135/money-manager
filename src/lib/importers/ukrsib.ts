import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Importer, ParsedRow, ParsedStatement } from "./types";

// Виписка за картковим рахунком Укрсибу (PDF із SAP, форма ZAM_SF_CARDACC_NEW).
// Текст дістаємо через `pdftotext -layout` (brew install poppler) — він зберігає колонки.
//
// Секції:
//  - "Операції за картковим рахунком": дата, дата розрахунку, опис, валюта, сума, сума в валюті рахунку
//  - "Операції за платіжними картками": те саме + код авторизації, з підзаголовком картки
//  - "Поточні блокування": холди — пропускаємо, вони прийдуть у наступній виписці проведеними

const AMOUNT = String.raw`-?\d{1,3}(?: \d{3})*\.\d{2}`;
const DATE = String.raw`\d{2}\.\d{2}\.\d{4}`;
const ACCOUNT_ROW = new RegExp(String.raw`^\s*(${DATE})\s+(${DATE})\s+(.*?)\s+([A-Z]{3})\s+(${AMOUNT})(?:\s+(${AMOUNT}))?\s*$`);
const CARD_ROW = new RegExp(String.raw`^\s*(${DATE})\s+(${DATE})\s+(\w{6})\s+(.*?)\s+([A-Z]{3})\s+(${AMOUNT})\s+(${AMOUNT})\s*$`);
const CARD_HEADER = /^([A-Z][A-Z ]+?)\s+(\d{6}\*{4}\d{4})\s+[A-Z]/;

type Section = "account" | "cards" | "holds" | null;

type Draft = {
  section: "account" | "cards";
  card: string | null;
  date: string;
  settleDate: string;
  authCode: string | null;
  desc: string[];
  details: string[];
  inDetails: boolean;
  currency: string;
  opAmount: number;
  accAmount: number | null;
};

const toMinor = (s: string) => Math.round(Number(s.replace(/ /g, "")) * 100);

function toUnix(date: string) {
  const [d, m, y] = date.split(".").map(Number);
  return Math.floor(new Date(y, m - 1, d, 12).getTime() / 1000);
}

// pdftotext ламає довгий опис посеред слова — склеюємо без пробілу всередині шляхів "a\b\c"
function joinWrapped(parts: string[]) {
  return parts
    .map((p) => p.trim().replace(/\s+/g, " "))
    .reduce((acc, p) => {
      if (!acc) return p;
      const glue = /\\\S*$/.test(acc) || p.startsWith("\\") ? "" : " ";
      return acc + glue + p;
    }, "");
}

export function parseUkrsibText(text: string): ParsedStatement {
  const lines = text.split("\n");
  const header = text.slice(0, 3000);
  const iban = header.match(/Номер рахунку\s+(UA\d{27})/)?.[1];
  const available = header.match(new RegExp(String.raw`Доступна сума\s+(${AMOUNT})\s+UAH`))?.[1];
  const debt = header.match(new RegExp(String.raw`Заборгованість, яка не передбачена Договором\s+(${AMOUNT})\s+UAH`))?.[1];
  const tariff = header.match(/Назва тарифного плану\s+(.+)$/m)?.[1]?.trim();
  if (!iban) throw new Error("Не схоже на виписку Укрсибу: не знайдено номер рахунку");

  const rows: ParsedRow[] = [];
  const cards = new Set<string>();
  let section: Section = null;
  let card: string | null = null;
  let cur: Draft | null = null;

  const flush = () => {
    if (cur && cur.accAmount !== null) rows.push(toRow(cur));
    cur = null;
  };

  const enter = (s: Section) => {
    // Заголовок секції повторюється на кожній сторінці — операція може продовжуватись після нього
    if (s !== section) flush();
    section = s;
  };

  for (const line of lines) {
    const t = line.trim();

    if (t.startsWith("Операції за картковим рахунком")) { enter("account"); continue; }
    if (t.startsWith("Операції за платіжними картками")) { enter("cards"); continue; }
    if (t.startsWith("Поточні блокування")) { enter("holds"); continue; }
    if (/^(Разом|Деталізована|Інформація про)/.test(t)) { flush(); continue; }
    if (/^(Дата\s|операції\s)/.test(t)) continue; // шапка таблиці на кожній сторінці

    const ch = line.match(CARD_HEADER);
    if (ch) {
      flush();
      card = ch[2];
      cards.add(card);
      continue;
    }

    if (section === "account") {
      const m = line.match(ACCOUNT_ROW);
      if (m) {
        flush();
        cur = {
          section, card: null, date: m[1], settleDate: m[2], authCode: null, desc: [m[3]], details: [], inDetails: false,
          currency: m[4], opAmount: toMinor(m[5]),
          // Без суми в валюті рахунку — інформаційний рядок ("Виникнення заборгованості"), не рух коштів
          accAmount: m[6] ? toMinor(m[6]) : null,
        };
        continue;
      }
    } else if (section === "cards") {
      const m = line.match(CARD_ROW);
      if (m) {
        flush();
        cur = {
          section, card, date: m[1], settleDate: m[2], authCode: m[3], desc: [m[4]], details: [], inDetails: false,
          currency: m[5], opAmount: toMinor(m[6]), accAmount: toMinor(m[7]),
        };
        continue;
      }
    } else if (section === "holds") {
      continue;
    }

    if (!cur || !t) continue;
    const draft: Draft = cur;
    if (t.startsWith("____")) draft.inDetails = true;
    else (draft.inDetails ? draft.details : draft.desc).push(t);
  }
  flush();

  return {
    account: {
      key: iban,
      name: `Укрсиб ${tariff ?? ""} …${iban.slice(-4)}`.replace(/\s+/g, " "),
      currency: "UAH",
      iban,
      balance: available ? toMinor(available) : undefined,
      debt: debt ? toMinor(debt) : 0,
      cardMasks: [...cards],
    },
    rows,
  };
}

function toRow(d: Draft): ParsedRow {
  let description = joinWrapped(d.desc);
  const details = joinWrapped(d.details);
  const acc = d.accAmount!;

  // "Оплата товарів\послуг\<термінал>\<країна>\<місто>[\<адреса>]\<мерчант> : Google Pay ****1234."
  if (/^Оплата ?товарів\\послуг\\/.test(description)) {
    const path = description.replace(/ ?: [\w ]+\*{4}\d{4}\.?$/, ""); // " : Google Pay ****1234."
    description = path.slice(path.lastIndexOf("\\") + 1).trim() || description;
  }

  // Різниця між сумою операції і сумою в валюті рахунку — комісія (якщо валюта та сама)
  const commission = d.currency === "UAH" && Math.abs(acc) > Math.abs(d.opAmount) ? Math.abs(acc) - Math.abs(d.opAmount) : 0;
  const counterpart = details.match(/Переказ на картку (\d{6}\*{4}\d{4}) (.+)$/);

  return {
    // З сирих даних виписки, щоб зміни в очистці опису не плодили дублів при реімпорті
    externalId:
      d.authCode && d.card
        ? `${d.card}:${d.authCode}:${d.date}`
        : `${d.date}:${d.settleDate}:${acc}:${d.desc.join(" ").replace(/\s+/g, " ")}`,
    time: toUnix(d.date),
    amount: acc,
    description: details && !counterpart && details !== description ? `${description} — ${details}` : description,
    commission,
    counterName: counterpart?.[2] ?? null,
    // Погашення овердрафту — бухгалтерський рух: самі витрати вже є в операціях по картці
    isTransfer: /^Погашення заборгованості/.test(description),
    raw: { section: d.section, card: d.card, desc: d.desc, details: d.details, opAmount: d.opAmount, currency: d.currency },
  };
}

function pdfToText(file: Buffer) {
  const dir = mkdtempSync(path.join(tmpdir(), "ukrsib-"));
  try {
    const pdf = path.join(dir, "statement.pdf");
    writeFileSync(pdf, file);
    return execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", pdf, "-"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      throw new Error("Потрібен pdftotext: встанови `brew install poppler`");
    throw e;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export const ukrsibImporter: Importer = {
  bank: "ukrsib",
  label: "Укрсиббанк (PDF виписка)",
  accept: ".pdf",
  parse(file, filename) {
    if (!filename.toLowerCase().endsWith(".pdf")) throw new Error("Очікую PDF-виписку з UKRSIB online");
    return parseUkrsibText(pdfToText(file));
  },
};
