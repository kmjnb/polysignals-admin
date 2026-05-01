import { NextResponse } from "next/server";
import { z } from "zod";

import { db, schema } from "@/db";
import { isAdmin } from "@/lib/admin-guard";
import { env } from "@/lib/env";
import { createSession } from "@/lib/session";
import { verifyTelegramLogin } from "@/lib/telegram-auth";

const PayloadSchema = z.object({
  id: z.number(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.number(),
  hash: z.string(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "bad_payload" }, { status: 400 });
  }
  const data = parsed.data;

  const v = verifyTelegramLogin(data, env.BOT_TOKEN);
  if (!v.ok) {
    return NextResponse.json({ ok: false, error: v.reason }, { status: 401 });
  }

  if (!(await isAdmin(data.id))) {
    return NextResponse.json(
      { ok: false, error: "not_admin", user_id: data.id, username: data.username ?? null },
      { status: 403 },
    );
  }

  const fullName = [data.first_name, data.last_name].filter(Boolean).join(" ") || null;
  await db
    .insert(schema.adminUsers)
    .values({ userId: data.id, username: data.username, fullName })
    .onConflictDoNothing();

  await createSession({
    uid: data.id,
    username: data.username,
    name: fullName ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
