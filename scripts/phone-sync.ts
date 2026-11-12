// Синк з телефоном командою з ноутбука (телефон підключений через adb, напр. бездротове налагодження):
//   npm run phone:push   — свіжі дані з Mac → телефон
//   npm run phone:pull   — бекап з телефона → база Mac (для аналітики)
// Піднімає одноразовий HTTP-сервер з випадковим токеном і відкриває на телефоні money://sync?... через adb.
// Без adb (нема кабелю/налагодження) — показує QR: скануєш камерою → сторінка з кнопкою → апка.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import QRCode from "qrcode";
import { buildSnapshot, importPhoneSnapshot } from "@/lib/snapshot";

const mode = process.argv[2];
if (mode !== "push" && mode !== "pull") {
  console.error("Використання: npm run phone:push | npm run phone:pull");
  process.exit(1);
}

const ADB = process.env.ADB ?? path.join(process.env.ANDROID_HOME ?? path.join(homedir(), "Library/Android/sdk"), "platform-tools/adb");
const PORT = Number(process.env.PHONE_SYNC_PORT ?? 3002);
const token = randomBytes(16).toString("hex");

// Справжній телефон через adb або явно заданий ADB_SERIAL (напр. емулятор); інакше — null і QR
function device(): string | null {
  if (process.env.ADB_SERIAL) return process.env.ADB_SERIAL;
  try {
    const lines = execFileSync(ADB, ["devices"], { encoding: "utf8" }).split("\n").slice(1).filter((l) => l.endsWith("\tdevice"));
    return lines.map((l) => l.split("\t")[0]).find((s) => !s.startsWith("emulator-")) ?? null;
  } catch {
    return null;
  }
}

// Емулятор бачить Mac як 10.0.2.2, телефон — за IP у локальній мережі
function hostFor(serial: string | null) {
  if (serial?.startsWith("emulator-")) return "10.0.2.2";
  return execFileSync("ipconfig", ["getifaddr", "en0"], { encoding: "utf8" }).trim();
}

const serial = device();
const base = `http://${hostFor(serial)}:${PORT}`;
const TIMEOUT_MS = serial ? 90_000 : 5 * 60_000;
const target = mode === "push" ? `${base}/snapshot?token=${token}` : `${base}/backup?token=${token}`;
const link = `money://sync?mode=${mode === "push" ? "import" : "backup"}&url=${encodeURIComponent(target)}`;
// Chrome не відкриває кастомні схеми без тапу, тому сторінка з кнопкою й intent:// з пакетом апки
const intent = `intent://sync?mode=${mode === "push" ? "import" : "backup"}&url=${encodeURIComponent(target)}#Intent;scheme=money;package=ua.klymenko.money;end`;

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", base);
  if (url.searchParams.get("token") !== token) {
    res.writeHead(401).end();
    return;
  }
  if (req.method === "GET" && url.pathname === "/go") {
    res
      .writeHead(200, { "content-type": "text/html; charset=utf-8" })
      .end(
        `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#0b0b0a;display:grid;place-items:center;height:100vh;font-family:sans-serif">` +
          `<a href="${intent}" style="background:#f2f1ed;color:#0b0b0a;padding:16px 28px;border-radius:999px;text-decoration:none;font-weight:700">відкрити в «Гроші»</a></body>`,
      );
    return;
  }
  if (mode === "push" && req.method === "GET" && url.pathname === "/snapshot") {
    const body = JSON.stringify(buildSnapshot());
    // Виходимо тільки коли відповідь повністю пішла — великий знімок не встигає за фіксовану паузу
    res.on("finish", () => {
      console.log(`телефон забрав дані (${(body.length / 1e6).toFixed(1)} МБ)`);
      finish(0);
    });
    res.on("close", () => {
      if (!res.writableFinished) console.error("з'єднання обірвалось — спробуй ще раз");
    });
    res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) }).end(body);
    return;
  }
  if (mode === "pull" && req.method === "POST" && url.pathname === "/backup") {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const r = importPhoneSnapshot(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        res.writeHead(200).end("ok");
        console.log(`з телефона: нових операцій ${r.added}, розстрочок ${r.loans}, бюджетів ${r.budgets}`);
        finish(0);
      } catch (e) {
        res.writeHead(400).end(String(e));
        console.error(e);
        finish(1);
      }
    });
    return;
  }
  res.writeHead(404).end();
});

function finish(code: number) {
  setTimeout(() => {
    server.close();
    process.exit(code);
  }, 300);
}

server.listen(PORT, "0.0.0.0", async () => {
  if (serial) {
    execFileSync(ADB, ["-s", serial, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `'${link}'`, "ua.klymenko.money"], { stdio: "ignore" });
    console.log(`${serial}: чекаю телефон (до ${TIMEOUT_MS / 1000} с)…`);
    return;
  }
  const go = `${base}/go?token=${token}`;
  const png = path.join(tmpdir(), "groshi-sync-qr.png");
  await QRCode.toFile(png, go, { width: 480, margin: 2 });
  execFileSync("open", [png]);
  console.log(await QRCode.toString(go, { type: "terminal", small: true }));
  console.log(`adb не бачить телефон — відскануй QR камерою (телефон у тій самій Wi-Fi), чекаю до ${TIMEOUT_MS / 60_000} хв…`);
});

setTimeout(() => {
  console.error("телефон не відповів — апка відкрилась? Mac і телефон в одній Wi-Fi?");
  process.exit(1);
}, TIMEOUT_MS);
