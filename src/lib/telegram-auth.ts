import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type TelegramAuthPayload = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

const MAX_AGE_SECONDS = 60 * 60 * 24; // 1 day

export function verifyTelegramLogin(
  payload: TelegramAuthPayload,
  botToken: string,
): { ok: true } | { ok: false; reason: string } {
  if (!botToken) return { ok: false, reason: "bot token missing" };

  const { hash, ...fields } = payload;
  if (!hash) return { ok: false, reason: "no hash" };

  const dataCheckString = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  const secretKey = createHash("sha256").update(botToken).digest();
  const computed = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(computed, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad hash" };
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - payload.auth_date;
  if (ageSeconds > MAX_AGE_SECONDS) {
    return { ok: false, reason: "auth_date too old" };
  }

  return { ok: true };
}
