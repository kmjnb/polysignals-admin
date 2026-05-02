import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import Link from "next/link";
import { revalidatePath } from "next/cache";

import { AdminShell } from "@/components/admin-shell";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/admin-guard";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SP = {
  q?: string;
  state?: "all" | "enabled" | "disabled";
  page?: string;
};

async function toggleEnabled(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const next = formData.get("next") === "1";
  if (!id) return;
  await db
    .update(schema.businessConnections)
    .set({ isEnabled: next, updatedAt: new Date() })
    .where(eq(schema.businessConnections.id, id));
  revalidatePath("/connections");
}

export default async function ConnectionsPage({
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
    const term = `%${sp.q}%`;
    const numeric = /^\d+$/.test(sp.q.trim()) ? Number(sp.q.trim()) : null;
    const conds = [
      ilike(schema.businessConnections.fullName, term),
      ilike(schema.businessConnections.username, term),
    ];
    if (numeric != null) {
      conds.push(eq(schema.businessConnections.userId, numeric));
    }
    filters.push(or(...conds)!);
  }
  if (sp.state === "enabled") filters.push(eq(schema.businessConnections.isEnabled, true));
  if (sp.state === "disabled") filters.push(eq(schema.businessConnections.isEnabled, false));

  const where = filters.length ? and(...filters) : undefined;

  const [rows, totalRow, msgCounts] = await Promise.all([
    db
      .select()
      .from(schema.businessConnections)
      .where(where)
      .orderBy(desc(schema.businessConnections.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ n: count() }).from(schema.businessConnections).where(where),
    db
      .select({
        connId: schema.messages.businessConnectionId,
        n: count(),
      })
      .from(schema.messages)
      .groupBy(schema.messages.businessConnectionId),
  ]);

  const total = totalRow[0]?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const msgCountByConn = new Map<string, number>(
    msgCounts.map((r) => [r.connId, Number(r.n)]),
  );

  return (
    <AdminShell session={session}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <div>
            <h2 className="text-xl font-semibold">Подключённые business-аккаунты</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Найдено: <span className="text-neutral-300 tabular-nums">{total}</span>
            </p>
          </div>
        </div>

        <FiltersForm sp={sp} />

        <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
          <table className="w-full text-sm">
            <thead className="text-neutral-400 text-xs uppercase tracking-wide">
              <tr className="border-b border-neutral-800">
                <Th>Пользователь</Th>
                <Th className="w-32">user_id</Th>
                <Th className="w-32">connection_id</Th>
                <Th className="w-24">Reply</Th>
                <Th className="w-24">Согласие</Th>
                <Th className="w-28">Сообщений</Th>
                <Th className="w-40">Подключён</Th>
                <Th className="w-32">Статус</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const display = r.fullName || (r.username ? `@${r.username}` : `id:${r.userId}`);
                const msgs = msgCountByConn.get(r.id) ?? 0;
                return (
                  <tr key={r.id} className="border-b border-neutral-800/60 hover:bg-neutral-800/40">
                    <Td className="text-neutral-100 max-w-[24ch]">
                      <div className="truncate">{display}</div>
                      {r.username && r.fullName ? (
                        <div className="text-xs text-neutral-500 truncate">@{r.username}</div>
                      ) : null}
                    </Td>
                    <Td className="text-neutral-400 tabular-nums">{r.userId}</Td>
                    <Td className="text-neutral-500 font-mono text-xs">
                      {r.id.slice(0, 10)}…
                    </Td>
                    <Td className="text-neutral-400">
                      {r.canReply ? (
                        <span className="text-emerald-400">да</span>
                      ) : (
                        <span className="text-neutral-500">нет</span>
                      )}
                    </Td>
                    <Td className="text-neutral-400 tabular-nums whitespace-nowrap">
                      {r.consentedAt ? formatDateTime(r.consentedAt) : <span className="text-neutral-600">—</span>}
                    </Td>
                    <Td className="text-neutral-300 tabular-nums">
                      {msgs ? (
                        <Link
                          className="hover:text-white underline-offset-2 hover:underline"
                          href={`/messages?conn=${encodeURIComponent(r.id)}`}
                        >
                          {msgs}
                        </Link>
                      ) : (
                        <span className="text-neutral-600">0</span>
                      )}
                    </Td>
                    <Td className="text-neutral-400 tabular-nums whitespace-nowrap">
                      {formatDateTime(r.createdAt)}
                    </Td>
                    <Td>
                      <form action={toggleEnabled}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="next" value={r.isEnabled ? "0" : "1"} />
                        <button
                          type="submit"
                          className={`px-2.5 py-1 rounded-md text-xs border transition ${
                            r.isEnabled
                              ? "border-emerald-700/60 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                              : "border-neutral-700 bg-neutral-800/60 text-neutral-400 hover:bg-neutral-700"
                          }`}
                          title={r.isEnabled ? "Кликни чтобы отключить" : "Кликни чтобы включить"}
                        >
                          {r.isEnabled ? "включён" : "отключён"}
                        </button>
                      </form>
                    </Td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-neutral-500">
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

function FiltersForm({ sp }: { sp: SP }) {
  return (
    <form
      method="GET"
      action="/connections"
      className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4"
    >
      <Field label="Поиск (имя / @username / user_id)">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Иван / @vasya / 123456" className={inputCls} />
      </Field>
      <Field label="Состояние">
        <select name="state" defaultValue={sp.state ?? "all"} className={inputCls}>
          <option value="all">все</option>
          <option value="enabled">включённые</option>
          <option value="disabled">отключённые</option>
        </select>
      </Field>
      <div className="flex items-end justify-end gap-2 pt-1">
        <Link
          href="/connections"
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
    return `/connections?${params.toString()}`;
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
