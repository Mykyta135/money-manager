import { timingSafeEqual } from "node:crypto";
import { buildSnapshot } from "@/lib/snapshot";

// Повний знімок бази для мобільної апки (один раз при налаштуванні телефона).
// Доступ тільки з токеном EXPORT_TOKEN з .env.local; запускати через `npm run dev:lan`.

function authorized(request: Request) {
  const expected = process.env.EXPORT_TOKEN;
  const got = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!expected || !got || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });

  return Response.json(buildSnapshot());
}
