export type ParsedRow = {
  externalId?: string; // стабільний id від банку (напр. код авторизації), якщо є
  time: number; // unix seconds
  amount: number; // копійки, витрати < 0
  description: string;
  mcc?: number | null;
  commission?: number;
  balanceAfter?: number | null;
  counterName?: string | null;
  counterIban?: string | null;
  isTransfer?: boolean;
  raw?: unknown;
};

export type ParsedStatement = {
  account: {
    key: string;
    name: string;
    currency: string;
    iban?: string;
    balance?: number;
    debt?: number;
    cardMasks?: string[];
  };
  rows: ParsedRow[];
};

export type Importer = {
  bank: "ukrsib" | "pumb";
  label: string;
  accept: string; // для <input type="file" accept>
  parse(file: Buffer, filename: string): ParsedStatement;
};
