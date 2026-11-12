// Персональний API monobank: https://api.monobank.ua/docs/
// Ліміт: 1 запит на 60 с, виписка — максимум 31 доба + 1 год і до 500 транзакцій за раз.

const BASE = "https://api.monobank.ua";
const MIN_INTERVAL_MS = 61_000;

export type MonoAccount = {
  id: string;
  sendId: string;
  balance: number;
  creditLimit: number;
  type: string;
  currencyCode: number;
  cashbackType?: string;
  maskedPan: string[];
  iban: string;
};

export type MonoJar = {
  id: string;
  title: string;
  description: string;
  currencyCode: number;
  balance: number;
  goal?: number;
};

export type MonoClientInfo = {
  clientId: string;
  name: string;
  accounts: MonoAccount[];
  jars?: MonoJar[];
};

export type MonoStatementItem = {
  id: string;
  time: number;
  description: string;
  mcc: number;
  originalMcc: number;
  hold: boolean;
  amount: number;
  operationAmount: number;
  currencyCode: number;
  commissionRate: number;
  cashbackAmount: number;
  balance: number;
  comment?: string;
  receiptId?: string;
  invoiceId?: string;
  counterEdrpou?: string;
  counterIban?: string;
  counterName?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MonoClient {
  private lastCallAt = 0;

  constructor(
    private token: string,
    private log: (msg: string) => void = () => {},
  ) {}

  private async request<T>(path: string): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const wait = this.lastCallAt + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) {
        this.log(`чекаю ${Math.ceil(wait / 1000)} с (ліміт API)…`);
        await sleep(wait);
      }
      this.lastCallAt = Date.now();

      const res = await fetch(BASE + path, { headers: { "X-Token": this.token } });
      if (res.ok) return (await res.json()) as T;

      // 429 буває, якщо паралельно ходить інший процес (скрипт + сервер)
      if (res.status === 429 && attempt < 3) {
        this.log("429 — забагато запитів, повторю за хвилину");
        continue;
      }
      throw new Error(`monobank ${res.status} ${path}: ${await res.text()}`);
    }
  }

  clientInfo() {
    return this.request<MonoClientInfo>("/personal/client-info");
  }

  statement(accountId: string, from: number, to: number) {
    return this.request<MonoStatementItem[]>(`/personal/statement/${accountId}/${from}/${to}`);
  }
}
