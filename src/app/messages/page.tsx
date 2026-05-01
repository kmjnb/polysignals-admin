import { and, asc, count, desc, eq, gte, ilike, isNotNull, lte, or, sql } from "drizzle-orm";
import Link from "next/link";

import { AdminShell } from "@/components/admin-shell";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/admin-guard";
import { formatDateTime, mediaLabel, truncate } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SP = {
  q?: string;
  chat?: string;
  conn?: string;
  from?: string;
  media?: string;
  state?: "all" | "deleted" | "edited" | "captured";
  date_from?: string;
  date_to?: string;
  page?: string;
};

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const session = await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const filters = [];
  if (sp.q) {
    filters.push(ilike(schema.messages.text, `%${sp.q}%`));
  }
  if (sp.chat) {
    const n = parseChatId(sp.chat);
    if (n != null) filters.push(eq(schema.messages.chatId, n));
  }
  if (sp.conn) {
    filters.push(eq(schema.messages.businessConnectionId, sp.conn));
  }
  if (sp.from) {
    const n = parseChatId(sp.from);
    if (n != null) filters.push(eq(schema.messages.fromId, n));
  }
  if (sp.media === "any") filters.push(isNotNull(schema.messages.mediaType));
  else if (sp.media && sp.media !== "all") filters.push(eq(schema.messages.mediaType, sp.media));
  if (sp.state === "deleted") filters.push(isNotNull(schema.messages.deletedAt));
  if (sp.state === "edited") filters.push(isNotNull(schema.messages.editedAt));
  if (sp.state === "captured") filters.push(eq(schema.messages.capturedViaReply, true));
  if (sp.date_from) {
    const d = parseDate(sp.date_from);
    if (d) filters.push(gte(schema.messages.createdAt, d));
  }
  if (sp.date_to) {
    const d = parseDate(sp.date_to, true);
    if (d) filters.push(lte(schema.messages.createdAt, d));
  }

  const where = filters.length ? and(...filters) : undefined;

  const [rows, totalRow, mediaTypesRow, connectionsRow] = await Promise.all([
    db
      .select()
      .from(schema.messages)
      .where(where)
      .orderBy(desc(schema.messages.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ n: count() }).from(schema.messages).where(where),
    db
      .selectDistinct({ mediaType: schema.messages.mediaType })
      .from(schema.messages)
      .where(isNotNull(schema.messages.mediaType))
      .orderBy(asc(schema.messages.mediaType)),
    db
      .select()
      .from(schema.businessConnections)
      .orderBy(asc(schema.businessConnections.createdAt)),
  ]);

  const total = totalRow[0]?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminShell session={session}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <div>
            <h2 className="text-xl font-semibold">История сообщений</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Найдено: <span className="text-neutral-300 tabular-nums">{total}</span>
            </p>
          </div>
        </div>

        <FiltersForm sp={sp} mediaTypes={mediaTypesRow.map((r) => r.mediaType!)} connections={connectionsRow} />

        <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
          <table className="w-full text-sm">
            <thead className="text-neutral-400 text-xs uppercase tracking-wide">
              <tr className="border-b border-neutral-800">
                <Th className="w-40">Когда</Th>
                <Th>Чат</Th>
                <Th>От</Th>
                <Th className="w-28">Тип</Th>
                <Th>Текст</Th>
                <Th className="w-24">Состояние</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const state: string[] = [];
                if (r.deletedAt) state.push("🗑");
                if (r.editedAt) state.push("✏️");
                if (r.capturedViaReply) state.push("👁");
                const text = r.text ?? "";
                return (
                  <tr key={`${r.businessConnectionId}-${r.chatId}-${r.messageId}`} className="border-b border-neutral-800/60 hover:bg-neutral-800/40">
                    <Td className="text-neutral-400 tabular-nums whitespace-nowrap">
                      {formatDateTime(r.createdAt)}
                    </Td>
                    <Td className="text-neutral-200 max-w-[18ch] truncate">
                      {r.chatLabel ?? `id:${r.chatId}`}
                    </Td>
                    <Td className="text-neutral-300 max-w-[18ch] truncate">
                      {r.fromName ?? (r.fromId ? `id:${r.fromId}` : "—")}
                    </Td>
                    <Td className="text-neutral-300 whitespace-nowrap">{mediaLabel(r.mediaType)}</Td>
                    <Td className="text-neutral-200 max-w-[40ch]">
                      <span className="line-clamp-2 break-words">{truncate(text, 200)}</span>
                    </Td>
                    <Td className="whitespace-nowrap">{state.join(" ")}</Td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-neutral-500">
                    Ничего не найдено
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <Pagination sp={sp} page={page} totalPages={totalPages} />
      </div>
    </AdminShell>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`text-left px-3 py-2 font-medium ${className}`}>{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 align-top ${className}`}>{children}</td>;
}

function parseChatId(s: string): number | null {
  const t = s.replace(/[^\d-]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseDate(s: string, endOfDay = false): Date | null {
  // Accept yyyy-mm-dd or full ISO.
  const d = new Date(s.length === 10 ? s + (endOfDay ? "T23:59:59" : "T00:00:00") : s);
  return isNaN(d.getTime()) ? null : d;
}

function FiltersForm({
  sp,
  mediaTypes,
  connections,
}: {
  sp: SP;
  mediaTypes: string[];
  connections: { id: string; userId: number; fullName: string | null; username: string | null }[];
}) {
  return (
    <form
      method="GET"
      action="/messages"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4"
    >
      <Field label="Поиск по тексту">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="фрагмент сообщения" className={inputCls} />
      </Field>
      <Field label="Аккаунт">
        <select name="conn" defaultValue={sp.conn ?? ""} className={inputCls}>
          <option value="">все</option>
          {connections.map((c) => (
            <option key={c.id} value={c.id}>
              {(c.fullName || c.username || `user ${c.userId}`) + " · " + c.id.slice(0, 8) + "…"}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Тип медиа">
        <select name="media" defaultValue={sp.media ?? "all"} className={inputCls}>
          <option value="all">все</option>
          <option value="any">только медиа</option>
          {mediaTypes.map((m) => (
            <option key={m} value={m}>
              {mediaLabel(m) || m}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Состояние">
        <select name="state" defaultValue={sp.state ?? "all"} className={inputCls}>
          <option value="all">все</option>
          <option value="deleted">🗑 удалённые</option>
          <option value="edited">✏️ редактированные</option>
          <option value="captured">👁 captured-via-reply</option>
        </select>
      </Field>
      <Field label="Чат (id)">
        <input name="chat" defaultValue={sp.chat ?? ""} placeholder="-100… / 123…" className={inputCls} />
      </Field>
      <Field label="Отправитель (id)">
        <input name="from" defaultValue={sp.from ?? ""} placeholder="user_id" className={inputCls} />
      </Field>
      <Field label="С даты">
        <input name="date_from" type="date" defaultValue={sp.date_from ?? ""} className={inputCls} />
      </Field>
      <Field label="По дату">
        <input name="date_to" type="date" defaultValue={sp.date_to ?? ""} className={inputCls} />
      </Field>

      <div className="sm:col-span-2 lg:col-span-4 flex justify-end gap-2 pt-1">
        <Link
          href="/messages"
          className="px-3 py-1.5 text-sm rounded-md border border-neutral-700 text-neutral-300 hover:bg-neutral-800/60"
        >
          Сбросить
        </Link>
        <button
          type="submit"
          className="px-3 py-1.5 text-sm rounded-md bg-white text-black hover:bg-neutral-200"
        >
          Применить
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "w-full rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 block">
      <span className="text-xs uppercase tracking-wide text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

function Pagination({ sp, page, totalPages }: { sp: SP; page: number; totalPages: number }) {
  const make = (p: number): string => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (typeof v === "string" && v) params.set(k, v);
    }
    params.set("page", String(p));
    return `/messages?${params.toString()}`;
  };
  return (
    <div className="flex items-center justify-between text-sm text-neutral-400">
      <div>
        Страница <span className="text-neutral-200">{page}</span> из{" "}
        <span className="text-neutral-200">{totalPages}</span>
      </div>
      <div className="flex gap-2">
        <Link
          href={make(Math.max(1, page - 1))}
          className={`px-3 py-1.5 rounded-md border ${
            page <= 1 ? "pointer-events-none opacity-40 border-neutral-800" : "border-neutral-700 hover:bg-neutral-800/60"
          }`}
        >
          ← пред.
        </Link>
        <Link
          href={make(Math.min(totalPages, page + 1))}
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
