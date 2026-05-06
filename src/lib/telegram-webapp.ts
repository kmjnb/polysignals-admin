import { createHmac, timingSafeEqual } from "node:crypto";

export type WebAppUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type WebAppInitData = {
  user?: WebAppUser;
  auth_date: number;
  hash: string;
  query_id?: string;
  start_param?: string;
};

const MAX_AGE_SECONDS = 60 * 60 * 24;

/**
 * Verify Telegram Mini App initData (the `Telegram.WebApp.initData` string).
 * Spec: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * The secret key for Mini Apps is HMAC-SHA256("WebAppData", botToken). This is
 * different from the Login Widget, which uses sha256(botToken) directly.
 */
export function verifyWebAppInitData(
  initData: string,
  botToken: string,
): { ok: true; data: WebAppInitData } | { ok: false; reason: string } {
  if (!botToken) return { ok: false, reason: "bot token missing" };
  if (!initData) return { ok: false, reason: "empty initData" };

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "no hash" };
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(computed, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad hash" };
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate)) return { ok: false, reason: "no auth_date" };
  if (Math.floor(Date.now() / 1000) - authDate > MAX_AGE_SECONDS) {
    return { ok: false, reason: "auth_date too old" };
  }

  let user: WebAppUser | undefined;
  const userRaw = params.get("user");
  if (userRaw) {
    try {
      user = JSON.parse(userRaw) as WebAppUser;
    } catch {
      return { ok: false, reason: "user not json" };
    }
  }

  return {
    ok: true,
    data: {
      user,
      auth_date: authDate,
      hash,
      query_id: params.get("query_id") ?? undefined,
      start_param: params.get("start_param") ?? undefined,
    },
  };
}
