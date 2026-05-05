"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { Agent, Dispatcher, ProxyAgent } from "undici";

import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/admin-guard";
import { env } from "@/lib/env";

export type AudienceType = "all" | "connected" | "manual";
export type MediaType = "photo" | "video" | "document";

export interface BroadcastButton {
  text: string;
  url: string;
}

export interface BroadcastPayload {
  text: string | null;
  parseMode: "markdown_v2" | null;
  media: { type: MediaType; fileId: string; fileName?: string } | null;
  buttons: BroadcastButton[][] | null;
}

export type UploadResult =
  | { ok: true; type: MediaType; fileId: string; fileName: string }
  | { ok: false; error: string };

const TG_API = "https://api.telegram.org";

function pickFileId(type: MediaType, result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const r = result as Record<string, unknown>;
  if (type === "photo") {
    const arr = r.photo;
    if (Array.isArray(arr) && arr.length > 0) {
      const last = arr[arr.length - 1] as Record<string, unknown> | undefined;
      const id = last?.file_id;
      return typeof id === "string" ? id : undefined;
    }
    return undefined;
  }
  const target = (r[type] ?? {}) as Record<string, unknown>;
  const id = target.file_id;
  return typeof id === "string" ? id : undefined;
}

export async function uploadMediaAction(formData: FormData): Promise<UploadResult> {
  await requireAdmin();
  const token = env.BROADCAST_BOT_TOKEN;
  if (!token)
    return {
      ok: false,
      error: "BROADCAST_BOT_TOKEN не настроен (нужен токен бота, который рассылает)",
    };
  const stash = env.PRIMARY_ADMIN_USER_ID;
  if (!stash)
    return {
      ok: false,
      error:
        "PRIMARY_ADMIN_USER_ID не задан — нужен для stash-чата с ботом",
    };

  const file = formData.get("file");
  const typeRaw = String(formData.get("type") ?? "");
  if (!(file instanceof File)) return { ok: false, error: "Файл не передан" };
  if (!["photo", "video", "document"].includes(typeRaw))
    return { ok: false, error: "Неверный тип медиа" };
  const type = typeRaw as MediaType;

  const method =
    type === "photo" ? "sendPhoto" : type === "video" ? "sendVideo" : "sendDocument";
  const field =
    type === "photo" ? "photo" : type === "video" ? "video" : "document";

  const tgForm = new FormData();
  tgForm.append("chat_id", String(stash));
  tgForm.append("disable_notification", "true");
  tgForm.append(field, file, file.name);

  let data: { ok: boolean; description?: string; result?: unknown };
  try {
    const dispatcher: Dispatcher = env.BOT_PROXY_URL
      ? new ProxyAgent(env.BOT_PROXY_URL)
      : new Agent();
    // Node's global fetch is backed by undici; pass dispatcher via the (typed-loose) init.
    const res = await fetch(`${TG_API}/bot${token}/${method}`, {
      method: "POST",
      body: tgForm,
      // @ts-expect-error undici accepts dispatcher; lib.dom.d.ts types don't expose it
      dispatcher,
    });
    data = (await res.json()) as typeof data;
  } catch (e) {
    return { ok: false, error: `Сеть: ${(e as Error).message}` };
  }
  if (!data.ok) {
    return { ok: false, error: data.description ?? "Bot API вернул ошибку" };
  }
  const fileId = pickFileId(type, data.result);
  if (!fileId)
    return { ok: false, error: "Bot API не вернул file_id" };
  return { ok: true, type, fileId, fileName: file.name };
}

export interface CreateBroadcastInput {
  title: string;
  audience: AudienceType;
  manualUserIds?: number[];
  payload: BroadcastPayload;
  mode: "draft" | "now" | "scheduled";
  scheduledAt?: string;
}

export type CreateResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

function validatePayload(p: BroadcastPayload): string | null {
  const hasText = !!(p.text && p.text.trim());
  const hasMedia = !!p.media;
  if (!hasText && !hasMedia) return "Должен быть текст или медиа";
  if (p.buttons) {
    for (const row of p.buttons) {
      for (const b of row) {
        if (!b.text.trim() || !b.url.trim()) return "У каждой кнопки нужен текст и URL";
        try {
          const u = new URL(b.url);
          if (!["http:", "https:", "tg:"].includes(u.protocol))
            return `Некорректный URL у кнопки: ${b.url}`;
        } catch {
          return `Некорректный URL у кнопки: ${b.url}`;
        }
      }
    }
  }
  return null;
}

export async function createBroadcastAction(
  input: CreateBroadcastInput,
): Promise<CreateResult> {
  await requireAdmin();

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Заголовок обязателен" };

  const payloadErr = validatePayload(input.payload);
  if (payloadErr) return { ok: false, error: payloadErr };

  let recipientIds: number[] = [];
  let audienceUserIds: number[] | null = null;

  if (input.audience === "all") {
    const rows = await db
      .select({ uid: schema.botUsers.userId })
      .from(schema.botUsers)
      .where(eq(schema.botUsers.isBlocked, false));
    recipientIds = rows.map((r) => Number(r.uid));
  } else if (input.audience === "connected") {
    const rows = await db
      .selectDistinct({ uid: schema.businessConnections.userId })
      .from(schema.businessConnections)
      .where(eq(schema.businessConnections.isEnabled, true));
    recipientIds = rows.map((r) => Number(r.uid));
  } else if (input.audience === "manual") {
    recipientIds = (input.manualUserIds ?? [])
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n > 0);
    audienceUserIds = recipientIds;
  } else {
    return { ok: false, error: "Неизвестная аудитория" };
  }

  recipientIds = Array.from(new Set(recipientIds));

  if (recipientIds.length === 0 && input.mode !== "draft") {
    return { ok: false, error: "В выбранной аудитории нет ни одного получателя" };
  }

  let status: string;
  let scheduledAt: Date | null = null;
  if (input.mode === "draft") {
    status = "draft";
  } else if (input.mode === "now") {
    status = "scheduled";
    scheduledAt = new Date();
  } else {
    if (!input.scheduledAt)
      return { ok: false, error: "Не указано время отправки" };
    const d = new Date(input.scheduledAt);
    if (Number.isNaN(d.getTime()))
      return { ok: false, error: "Некорректная дата отправки" };
    if (d.getTime() < Date.now() - 60_000)
      return { ok: false, error: "Дата отправки в прошлом" };
    status = "scheduled";
    scheduledAt = d;
  }

  const inserted = await db
    .insert(schema.broadcasts)
    .values({
      title,
      audience: input.audience,
      audienceUserIds: audienceUserIds,
      payload: input.payload,
      scheduledAt,
      totalRecipients: recipientIds.length,
      status,
    })
    .returning({ id: schema.broadcasts.id });

  const id = inserted[0]?.id;
  if (!id) return { ok: false, error: "Не удалось сохранить broadcast" };

  if (recipientIds.length > 0) {
    const CHUNK = 1000;
    for (let i = 0; i < recipientIds.length; i += CHUNK) {
      const chunk = recipientIds.slice(i, i + CHUNK);
      await db
        .insert(schema.broadcastRecipients)
        .values(
          chunk.map((uid) => ({
            broadcastId: id,
            userId: uid,
            status: "pending",
          })),
        )
        .onConflictDoNothing();
    }
  }

  revalidatePath("/broadcasts");
  return { ok: true, id };
}

export async function cancelBroadcastAction(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;
  await db
    .update(schema.broadcasts)
    .set({ status: "cancelled", finishedAt: new Date() })
    .where(eq(schema.broadcasts.id, id));
  revalidatePath("/broadcasts");
  revalidatePath(`/broadcasts/${id}`);
}

export async function deleteBroadcastAction(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;
  await db
    .delete(schema.broadcastRecipients)
    .where(eq(schema.broadcastRecipients.broadcastId, id));
  await db.delete(schema.broadcasts).where(eq(schema.broadcasts.id, id));
  revalidatePath("/broadcasts");
}
