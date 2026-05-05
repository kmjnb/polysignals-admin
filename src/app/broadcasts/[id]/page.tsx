import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/admin-guard";
import { formatDateTime } from "@/lib/format";

import {
  cancelBroadcastAction,
  deleteBroadcastAction,
  type BroadcastButton,
  type BroadcastPayload,
  type MediaType,
} from "../actions";
import { AutoRefresh } from "./auto-refresh";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = new Set(["scheduled", "running"]);

export default async function BroadcastDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin();
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const rows = await db
    .select()
    .from(schema.broadcasts)
    .where(eq(schema.broadcasts.id, id))
    .limit(1);
  const b = rows[0];
  if (!b) notFound();

  const [statusBreakdown, recentFailuresRaw] = await Promise.all([
    db
      .select({
        status: schema.broadcastRecipients.status,
        n: sql<number>`count(*)::int`,
      })
      .from(schema.broadcastRecipients)
      .where(eq(schema.broadcastRecipients.broadcastId, id))
      .groupBy(schema.broadcastRecipients.status),
    db
      .select({
        userId: schema.broadcastRecipients.userId,
        error: schema.broadcastRecipients.errorMessage,
        sentAt: schema.broadcastRecipients.sentAt,
        username: schema.botUsers.username,
        fullName: schema.botUsers.fullName,
      })
      .from(schema.broadcastRecipients)
      .leftJoin(
        schema.botUsers,
        eq(schema.botUsers.userId, schema.broadcastRecipients.userId),
      )
      .where(
        and(
          eq(schema.broadcastRecipients.broadcastId, id),
          eq(schema.broadcastRecipients.status, "failed"),
          isNotNull(schema.broadcastRecipients.errorMessage),
        ),
      )
      .orderBy(desc(schema.broadcastRecipients.sentAt))
      .limit(15),
  ]);

  const breakdown: Record<string, number> = {
    pending: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  };
  for (const row of statusBreakdown) {
    breakdown[row.status] = Number(row.n);
  }

  const payload = b.payload as BroadcastPayload | null;
  const isActive = ACTIVE_STATUSES.has(b.status);
  const canCancel = b.status === "scheduled" || b.status === "running";
  const canDelete =
    b.status === "draft" || b.status === "done" || b.status === "cancelled";

  return (
    <AdminShell session={session}>
      {isActive ? <AutoRefresh intervalMs={4000} /> : null}
      <div className="space-y-4 max-w-5xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link
              href="/broadcasts"
              className="text-sm text-neutral-400 hover:text-neutral-200"
            >
              ← к списку
            </Link>
            <h2 className="text-xl font-semibold mt-1">{b.title}</h2>
            <div className="flex items-center gap-2 mt-2">
              <StatusBadge status={b.status} />
              <span className="text-xs text-neutral-500">
                #{b.id} · {audienceLabel(b.audience)} · {b.totalRecipients}{" "}
                получателей
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {canCancel ? (
              <form action={cancelBroadcastAction}>
                <input type="hidden" name="id" value={b.id} />
                <button
                  type="submit"
                  className="px-3 py-1.5 text-sm rounded-md border border-rose-700/60 text-rose-300 bg-rose-500/10 hover:bg-rose-500/20"
                >
                  Отменить
                </button>
              </form>
            ) : null}
            {canDelete ? (
              <form action={deleteBroadcastAction}>
                <input type="hidden" name="id" value={b.id} />
                <button
                  type="submit"
                  className="px-3 py-1.5 text-sm rounded-md border border-neutral-700 text-neutral-400 hover:bg-rose-500/15 hover:text-rose-300 hover:border-rose-700/60"
                >
                  Удалить
                </button>
              </form>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <ProgressCard
              sent={b.sentCount}
              failed={b.failedCount}
              total={b.totalRecipients}
              breakdown={breakdown}
            />

            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 space-y-3">
              <div className="text-xs uppercase tracking-wide text-neutral-500">
                Содержимое
              </div>
              <PayloadView payload={payload} />
            </div>

            {breakdown.failed > 0 ? (
              <div className="rounded-lg border border-neutral-800 bg-neutral-900">
                <div className="text-xs uppercase tracking-wide text-neutral-500 px-4 pt-3 pb-2">
                  Последние ошибки
                </div>
                <table className="w-full text-sm">
                  <thead className="text-neutral-400 text-xs uppercase tracking-wide">
                    <tr className="border-b border-neutral-800">
                      <Th className="w-32">user_id</Th>
                      <Th>Получатель</Th>
                      <Th>Ошибка</Th>
                      <Th className="w-44">Время</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentFailuresRaw.map((f) => {
                      const display =
                        f.fullName ||
                        (f.username ? `@${f.username}` : `id:${f.userId}`);
                      return (
                        <tr
                          key={String(f.userId)}
                          className="border-b border-neutral-800/60"
                        >
                          <Td className="text-neutral-400 tabular-nums">
                            {String(f.userId)}
                          </Td>
                          <Td className="text-neutral-200 max-w-[24ch] truncate">
                            {display}
                          </Td>
                          <Td className="text-rose-300 max-w-[40ch] truncate font-mono text-xs">
                            {f.error}
                          </Td>
                          <Td className="text-neutral-500 tabular-nums whitespace-nowrap">
                            {formatDateTime(f.sentAt)}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 space-y-3">
              <div className="text-xs uppercase tracking-wide text-neutral-500">
                Тайминг
              </div>
              <KV label="Создано" value={formatDateTime(b.createdAt)} />
              <KV
                label="Запланировано"
                value={b.scheduledAt ? formatDateTime(b.scheduledAt) : "—"}
              />
              <KV
                label="Старт"
                value={b.startedAt ? formatDateTime(b.startedAt) : "—"}
              />
              <KV
                label="Завершено"
                value={b.finishedAt ? formatDateTime(b.finishedAt) : "—"}
              />
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

function ProgressCard({
  sent,
  failed,
  total,
  breakdown,
}: {
  sent: number;
  failed: number;
  total: number;
  breakdown: Record<string, number>;
}) {
  const pct = total > 0 ? Math.round(((sent + failed) / total) * 100) : 0;
  const sentPct = total > 0 ? (sent / total) * 100 : 0;
  const failedPct = total > 0 ? (failed / total) * 100 : 0;
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-wide text-neutral-500">
          Прогресс
        </div>
        <div className="text-2xl font-semibold tabular-nums">{pct}%</div>
      </div>
      <div className="h-3 w-full rounded bg-neutral-800 overflow-hidden flex">
        <div
          className="bg-emerald-500/80 transition-all"
          style={{ width: `${sentPct}%` }}
          aria-hidden
        />
        <div
          className="bg-rose-500/80 transition-all"
          style={{ width: `${failedPct}%` }}
          aria-hidden
        />
      </div>
      <div className="grid grid-cols-4 gap-3 text-sm">
        <Stat color="text-neutral-300" label="всего" value={total} />
        <Stat color="text-emerald-400" label="отправлено" value={sent} />
        <Stat color="text-rose-400" label="ошибок" value={failed} />
        <Stat
          color="text-neutral-500"
          label="осталось"
          value={breakdown.pending ?? 0}
        />
      </div>
    </div>
  );
}

function Stat({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div>
      <div className={`text-lg tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-neutral-500 uppercase tracking-wide">
        {label}
      </div>
    </div>
  );
}

function PayloadView({ payload }: { payload: BroadcastPayload | null }) {
  if (!payload) {
    return <div className="text-sm text-neutral-500">Пустой payload</div>;
  }
  return (
    <div className="space-y-3">
      {payload.text ? (
        <div>
          <div className="text-xs text-neutral-500 mb-1">
            Текст{" "}
            {payload.parseMode === "markdown_v2" ? "(MarkdownV2)" : ""}
          </div>
          <div className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm whitespace-pre-wrap break-words text-neutral-100 max-h-72 overflow-y-auto">
            {payload.text}
          </div>
        </div>
      ) : null}
      {payload.media ? (
        <div>
          <div className="text-xs text-neutral-500 mb-1">Медиа</div>
          <div className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
            <div className="text-neutral-200">
              {mediaTypeLabel(payload.media.type)}{" "}
              {payload.media.fileName ?? ""}
            </div>
            <div className="text-xs text-neutral-500 font-mono mt-1 break-all">
              {payload.media.fileId}
            </div>
          </div>
        </div>
      ) : null}
      {payload.buttons && payload.buttons.length > 0 ? (
        <div>
          <div className="text-xs text-neutral-500 mb-1">Кнопки</div>
          <div className="space-y-1">
            {payload.buttons.map((row: BroadcastButton[], ri) => (
              <div key={ri} className="flex gap-1">
                {row.map((b: BroadcastButton, bi) => (
                  <a
                    key={bi}
                    href={b.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 rounded-md bg-sky-800/40 border border-sky-600/40 px-2 py-1 text-xs text-center text-neutral-100 truncate hover:bg-sky-700/60"
                    title={b.url}
                  >
                    {b.text}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft: {
      label: "черновик",
      cls: "border-neutral-700 bg-neutral-800/60 text-neutral-400",
    },
    scheduled: {
      label: "запланирована",
      cls: "border-sky-700/60 bg-sky-500/10 text-sky-300",
    },
    running: {
      label: "идёт",
      cls: "border-amber-700/60 bg-amber-500/10 text-amber-300",
    },
    done: {
      label: "готово",
      cls: "border-emerald-700/60 bg-emerald-500/10 text-emerald-300",
    },
    cancelled: {
      label: "отменена",
      cls: "border-rose-700/60 bg-rose-500/10 text-rose-300",
    },
  };
  const { label, cls } = map[status] ?? {
    label: status,
    cls: "border-neutral-700 bg-neutral-800 text-neutral-400",
  };
  return (
    <span className={`inline-block px-2.5 py-1 rounded-md text-xs border ${cls}`}>
      {label}
    </span>
  );
}

function audienceLabel(a: string): string {
  return a === "all"
    ? "все пользователи"
    : a === "connected"
      ? "business-подключения"
      : a === "manual"
        ? "ручной список"
        : a;
}

function mediaTypeLabel(t: MediaType): string {
  return t === "photo" ? "📷 фото" : t === "video" ? "🎬 видео" : "📎 файл";
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <div className="w-32 text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <div className="flex-1 text-neutral-200 tabular-nums">{value}</div>
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`text-left px-3 py-2 font-medium ${className}`}>{children}</th>
  );
}
function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2 align-top ${className}`}>{children}</td>;
}
