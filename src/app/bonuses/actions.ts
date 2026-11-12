"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { offers } from "@/db/schema";

export async function toggleOffer(id: string, activated: boolean) {
  db.update(offers).set({ activated }).where(eq(offers.id, id)).run();
  refresh();
}
