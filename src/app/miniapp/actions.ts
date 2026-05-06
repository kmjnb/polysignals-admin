"use server";

import { and, eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { verifyWebAppInitData } from "@/lib/telegram-webapp";

type Result =
  | { ok: true; invoice_link: string }
  | { ok: false; error: string };

export async function createInvoiceLinkForPlan(
  initData: string,
  planId: number,
): Promise<Result> {
  if (!env.BROADCAST_BOT_TOKEN) {
    return { ok: false, error: "BROADCAST_BOT_TOKEN не настроен" };
  }
  const verified = verifyWebAppInitData(initData, env.BROADCAST_BOT_TOKEN);
  if (!verified.ok) return { ok: false, error: `auth: ${verified.reason}` };
  if (!verified.data.user) return { ok: false, error: "no user in initData" };

  const [plan] = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(
      and(
        eq(schema.subscriptionPlans.id, planId),
        eq(schema.subscriptionPlans.isActive, true),
      ),
    )
    .limit(1);
  if (!plan) return { ok: false, error: "тариф не найден или выключен" };

  const description =
    plan.durationDays === null
      ? "Пожизненный доступ"
      : `Доступ ${plan.durationDays} дн.`;

  // Telegram Bot API: createInvoiceLink for Stars (currency=XTR).
  // payload format must match what the bot expects in successful_payment
  // (see bizlogger/bot/payments.py — "plan:<id>").
  const res = await fetch(
    `https://api.telegram.org/bot${env.BROADCAST_BOT_TOKEN}/createInvoiceLink`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: plan.name,
        description,
        payload: `plan:${plan.id}`,
        currency: "XTR",
        prices: [{ label: plan.name, amount: plan.starsPrice }],
      }),
    },
  );
  const data = (await res.json().catch(() => null)) as
    | { ok: true; result: string }
    | { ok: false; description?: string }
    | null;
  if (!data || !data.ok) {
    return {
      ok: false,
      error: data && "description" in data ? data.description ?? "API error" : "API error",
    };
  }
  return { ok: true, invoice_link: data.result };
}
