import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

import { env } from "./env";

const COOKIE_NAME = "ps_session";
const ALG = "HS256";

export type SessionPayload = {
  uid: number;
  username?: string;
  name?: string;
};

function key(): Uint8Array {
  if (!env.AUTH_SECRET) throw new Error("AUTH_SECRET not set");
  return new TextEncoder().encode(env.AUTH_SECRET);
}

export async function createSession(payload: SessionPayload, days = 14): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(key());
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: days * 24 * 60 * 60,
  });
}

export async function readSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: [ALG] });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}
