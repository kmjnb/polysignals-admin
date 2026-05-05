import { count, desc } from "drizzle-orm";
import Link from "next/link";

import { AdminShell } from "@/components/admin-shell";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/admin-guard";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SP = { page?: string };

export default async function BroadcastsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const session = await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [rows, totalRow] = await Promise.all([
    db
      .select()
      .from(schema.broadcasts)
      .orderBy(desc(schema.broadcasts.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ n: count() }).from(schema.broadcasts),
  ]);

  const total = totalRow[0]?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminShell session={session}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <div>
            <h2 className="text-xl font-semibold">Рассылки</h2>
            <p className="text-xs text-neutral-500 mt-0.5 max-w-prose">
              Сообщения, разосланные через бота. Создаются мастером, разносит фоновый воркер.
            </p>
          </div>
          <Link
            href="/broadcasts/new"
            className="px-3 py-1.5 text-sm rounded-md bg-white text-black hover:bg-neutral-200"
          >
            Новая рассылка
          </Link>
        </div>

        <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
          <table className="w-full text-sm">
            <thead className="text-neutral-400 text-xs uppercase tracking-wide">
              <tr className="border-b border-neutral-800">
                <Th>Название</Th>
                <Th className="w-32">Аудитория</Th>
                <Th className="w-28">Статус</Th>
                <Th className="w-48">Прогресс</Th>
                <Th className="w-44">Запланировано</Th>
                <Th className="w-44">Создано</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-neutral-800/60 hover:bg-neutral-800/40"
                >
                  <Td className="text-neutral-100">
                    <Link
                      href={`/broadcasts/${b.id}`}
                      className="hover:underline underline-offset-2"
                    >
                      {b.title}
                    </Link>
                  </Td>
                  <Td className="text-neutral-300">
                    <AudienceBadge audience={b.audience} />
                  </Td>
                  <Td>
                    <StatusBadge status={b.status} />
                  </Td>
                  <Td>
                    <Progress
                      sent={b.sentCount}
                      failed={b.failedCount}
                      total={b.totalRecipients}
                    />
                  </Td>
                  <Td className="text-neutral-400 tabular-nums whitespace-nowrap">
                    {b.scheduledAt ? formatDateTime(b.scheduledAt) : "—"}
                  </Td>
                  <Td className="text-neutral-400 tabular-nums whitespace-nowrap">
                    {formatDateTime(b.createdAt)}
                  </Td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-sm text-neutral-500"
                  >
                    Рассылок ещё нет — создай первую кнопкой выше
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <Pagination page={page} totalPages={totalPages} />
        ) : null}
      </div>
    </AdminShell>
  );
}

function AudienceBadge({ audience }: { audience: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    all: {
      label: "все",
      cls: "border-sky-700/60 bg-sky-500/10 text-sky-300",
    },
    connected: {
      label: "только bz-подключения",
      cls: "border-violet-700/60 bg-violet-500/10 text-violet-300",
    },
    manual: {
      label: "ручной список",
      cls: "border-amber-700/60 bg-amber-500/10 text-amber-300",
    },
  };
  const { label, cls } = map[audience] ?? {
    label: audience,
    cls: "border-neutral-700 bg-neutral-800 text-neutral-400",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-md text-xs border ${cls}`}>
      {label}
    </span>
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
    <span className={`inline-block px-2 py-0.5 rounded-md text-xs border ${cls}`}>
      {label}
    </span>
  );
}

function Progress({
  sent,
  failed,
  total,
}: {
  sent: number;
  failed: number;
  total: number;
}) {
  if (total === 0) {
    return <span className="text-neutral-500 text-xs">—</span>;
  }
  const sentPct = Math.round((sent / total) * 100);
  const failedPct = Math.round((failed / total) * 100);
  return (
    <div className="space-y-1">
      <div className="h-1.5 w-full rounded bg-neutral-800 overflow-hidden flex">
        <div
          className="bg-emerald-500/80"
          style={{ width: `${sentPct}%` }}
          aria-hidden
        />
        <div
          className="bg-rose-500/80"
          style={{ width: `${failedPct}%` }}
          aria-hidden
        />
      </div>
      <div className="text-xs text-neutral-500 tabular-nums">
        <span className="text-emerald-400">{sent}</span>
        {failed > 0 ? (
          <>
            {" / "}
            <span className="text-rose-400">{failed} ✗</span>
          </>
        ) : null}
        {" / "}
        <span className="text-neutral-300">{total}</span>
      </div>
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

function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  return (
    <div className="flex items-center justify-between text-sm text-neutral-400">
      <div>
        Страница <span className="text-neutral-200">{page}</span> из{" "}
        <span className="text-neutral-200">{totalPages}</span>
      </div>
      <div className="flex gap-2">
        <Link
          href={`/broadcasts?page=${Math.max(1, page - 1)}`}
          className={`px-3 py-1.5 rounded-md border ${
            page <= 1
              ? "pointer-events-none opacity-40 border-neutral-800"
              : "border-neutral-700 hover:bg-neutral-800/60"
          }`}
        >
          ← пред.
        </Link>
        <Link
          href={`/broadcasts?page=${Math.min(totalPages, page + 1)}`}
          className={`px-3 py-1.5 rounded-md border ${
            page >= totalPages
              ? "pointer-events-none opacity-40 border-neutral-800"
              : "border-neutral-700 hover:bg-neutral-800/60"
          }`}
        >
          след. →
        </Link>
      </div>
    </div>
  );
}
