import { and, count, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/admin-guard";
import { formatDateTime, mediaLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 200;

export default async function ChatThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ connId: string; chatId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await requireAdmin();
  const { connId: connIdRaw, chatId: chatIdRaw } = await params;
  const sp = await searchParams;

  const connId = decodeURIComponent(connIdRaw);
  const chatId = Number(chatIdRaw);
  if (!connId || !Number.isFinite(chatId)) notFound();

  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const where = and(
    eq(schema.messages.businessConnectionId, connId),
    eq(schema.messages.chatId, chatId),
  );

  const [conn, totalRow, msgs] = await Promise.all([
    db
      .select()
      .from(schema.businessConnections)
      .where(eq(schema.businessConnections.id, connId))
      .limit(1),
    db.select({ n: count() }).from(schema.messages).where(where),
    db
      .select()
      .from(schema.messages)
      .where(where)
      .orderBy(desc(schema.messages.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
  ]);

  const total = totalRow[0]?.n ?? 0;
  if (total === 0 && page === 1) {
    // chat exists only if there's at least one message logged
    const exists = await db
      .select({ n: count() })
      .from(schema.messages)
      .where(where);
    if ((exists[0]?.n ?? 0) === 0) notFound();
  }
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Render chronologically (oldest at top, newest at bottom) within the page
  const ordered = [...msgs].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  const owner = conn[0];
  const ownerLabel =
    owner?.fullName ||
    (owner?.username ? `@${owner.username}` : owner ? `id:${owner.userId}` : "—");
  const chatLabel = ordered[0]?.chatLabel || msgs[0]?.chatLabel || `chat ${chatId}`;

  return (
    <AdminShell session={session}>
      <div className="space-y-4 max-w-4xl">
        <div>
          {owner ? (
            <Link
              href={`/users/${owner.userId}`}
              className="text-sm text-neutral-400 hover:text-neutral-200"
            >
              ← к пользователю {ownerLabel}
            </Link>
          ) : (
            <Link
              href="/users"
              className="text-sm text-neutral-400 hover:text-neutral-200"
            >
              ← к пользователям
            </Link>
          )}
          <div className="mt-1 flex items-center gap-3">
            <h2 className="text-xl font-semibold">{chatLabel}</h2>
            <span className="text-xs text-neutral-500 tabular-nums">
              chat_id {chatId} · {total} сообщений
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-1 font-mono">
            connection {connId}
          </p>
          <p className="text-xs text-neutral-500 mt-1 italic">
            Только просмотр — отправлять и редактировать отсюда нельзя.
          </p>
        </div>

        <div className="rounded-lg border border-neutral-800 bg-neutral-900 divide-y divide-neutral-800">
          {ordered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-neutral-500">
              Сообщений нет.
            </div>
          ) : (
            ordered.map((m) => (
              <MessageRow
                key={`${m.businessConnectionId}-${m.chatId}-${m.messageId}`}
                m={m}
                isOwner={
                  owner != null &&
                  m.fromId != null &&
                  Number(m.fromId) === Number(owner.userId)
                }
              />
            ))
          )}
        </div>

        {totalPages > 1 ? (
          <Pagination
            page={page}
            totalPages={totalPages}
            connId={connId}
            chatId={chatId}
          />
        ) : null}
      </div>
    </AdminShell>
  );
}

function MessageRow({
  m,
  isOwner,
}: {
  m: typeof schema.messages.$inferSelect;
  isOwner: boolean;
}) {
  const fromName =
    m.fromName ||
    (m.fromId != null ? `id:${String(m.fromId)}` : "—");
  const editHistory = parseEditHistory(m.editHistory);
  return (
    <div className="px-4 py-3 hover:bg-neutral-800/30">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span
            className={
              isOwner
                ? "font-medium text-sky-300"
                : "font-medium text-neutral-200"
            }
          >
            {fromName}
            {isOwner ? <span className="text-neutral-500"> · ты</span> : null}
          </span>
          {m.mediaType ? (
            <span className="text-neutral-500">{mediaLabel(m.mediaType)}</span>
          ) : null}
          {m.isSelfDestruct ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-300 border border-amber-700/40">
              one-time
            </span>
          ) : null}
          {m.capturedViaReply ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-violet-500/10 text-violet-300 border border-violet-700/40">
              captured
            </span>
          ) : null}
          {m.editedAt ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-500/10 text-sky-300 border border-sky-700/40">
              edited
            </span>
          ) : null}
          {m.deletedAt ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/10 text-rose-300 border border-rose-700/40">
              deleted
            </span>
          ) : null}
        </div>
        <span className="text-neutral-500 tabular-nums whitespace-nowrap">
          {formatDateTime(m.createdAt)}
        </span>
      </div>

      {m.text ? (
        <div className="mt-1 text-sm whitespace-pre-wrap break-words text-neutral-100">
          {m.text}
        </div>
      ) : (
        <div className="mt-1 text-sm text-neutral-500 italic">
          {m.mediaType ? `[${mediaLabel(m.mediaType)} без подписи]` : "[пусто]"}
        </div>
      )}

      {editHistory.length > 0 ? (
        <details className="mt-1 text-xs text-neutral-500">
          <summary className="cursor-pointer hover:text-neutral-300">
            история правок ({editHistory.length})
          </summary>
          <ul className="mt-1 space-y-1 pl-3 border-l border-neutral-800">
            {editHistory.map((h, i) => (
              <li key={i} className="text-neutral-400 whitespace-pre-wrap">
                {h}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {m.deletedAt ? (
        <div className="mt-1 text-xs text-rose-400">
          удалено в {formatDateTime(m.deletedAt)}
        </div>
      ) : m.editedAt ? (
        <div className="mt-1 text-xs text-sky-400">
          последняя правка {formatDateTime(m.editedAt)}
        </div>
      ) : null}
    </div>
  );
}

function parseEditHistory(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed))
        return parsed.filter((x): x is string => typeof x === "string");
    } catch {
      return [raw];
    }
  }
  return [];
}

function Pagination({
  page,
  totalPages,
  connId,
  chatId,
}: {
  page: number;
  totalPages: number;
  connId: string;
  chatId: number;
}) {
  const base = `/chats/${encodeURIComponent(connId)}/${chatId}`;
  return (
    <div className="flex items-center justify-between text-sm text-neutral-400">
      <div>
        Страница <span className="text-neutral-200">{page}</span> из{" "}
        <span className="text-neutral-200">{totalPages}</span>
      </div>
      <div className="flex gap-2">
        <Link
          href={`${base}?page=${Math.max(1, page - 1)}`}
          className={`px-3 py-1.5 rounded-md border ${
            page <= 1
              ? "pointer-events-none opacity-40 border-neutral-800"
              : "border-neutral-700 hover:bg-neutral-800/60"
          }`}
        >
          ← новее
        </Link>
        <Link
          href={`${base}?page=${Math.min(totalPages, page + 1)}`}
          className={`px-3 py-1.5 rounded-md border ${
            page >= totalPages
              ? "pointer-events-none opacity-40 border-neutral-800"
              : "border-neutral-700 hover:bg-neutral-800/60"
          }`}
        >
          старше →
        </Link>
      </div>
    </div>
  );
}

