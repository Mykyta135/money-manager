"use client";

import { useActionState, useState } from "react";
import { importStatement, type ImportResult } from "./actions";

type Option = { bank: string; label: string; accept: string };

export function ImportForm({ options }: { options: Option[] }) {
  const [state, action, pending] = useActionState<ImportResult, FormData>(importStatement, null);
  const [bank, setBank] = useState(options[0]?.bank);
  const accept = options.find((o) => o.bank === bank)?.accept;

  return (
    <form action={action} className="flex flex-wrap items-end gap-3 text-sm">
      <label>
        Банк
        <select
          name="bank"
          value={bank}
          onChange={(e) => setBank(e.target.value)}
          className="block rounded-md border border-line bg-background px-2 py-1.5"
        >
          {options.map((o) => (
            <option key={o.bank} value={o.bank}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Файл
        <input name="file" type="file" accept={accept} required className="block" />
      </label>
      <button disabled={pending} className="rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-50">
        {pending ? "Імпортую…" : "Імпортувати"}
      </button>
      {state && <p className={`w-full ${state.ok ? "text-income" : "text-bad"}`}>{state.message}</p>}
    </form>
  );
}
