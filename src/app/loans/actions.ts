"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { loans } from "@/db/schema";
import { parseMoney } from "@/lib/format";

const BANKS = ["mono", "ukrsib", "pumb"] as const;

export async function addLoan(form: FormData) {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const bank = get("bank");
  if (!(BANKS as readonly string[]).includes(bank)) throw new Error("Невідомий банк");

  db.insert(loans)
    .values({
      bank: bank as (typeof BANKS)[number],
      name: get("name") || "Кредит",
      principal: parseMoney(get("principal")),
      monthlyPayment: parseMoney(get("monthlyPayment")),
      termMonths: Number(get("termMonths")),
      startDate: get("startDate"),
      oneTimeFee: get("oneTimeFee") ? parseMoney(get("oneTimeFee")) : 0,
      notes: get("notes") || null,
    })
    .run();
  refresh();
}

export async function deleteLoan(id: number) {
  db.delete(loans).where(eq(loans.id, id)).run();
  refresh();
}
