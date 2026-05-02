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
  state?: "all" | "active" | "blocked";
  page?: string;
};

async function toggleBlocked(formData: FormData) {
  "use server";
  await requireAdmin();
  const userIdRaw = String(formData.get("user_id") ?? "");
  const next = formData.get("next") === "1";
  const userId = Number(userIdRaw);
  if (!Number.isFinite(userId)) return;
  await db
    .update(schema.botUsers)
    .set({ isBlocked: next })
    .where(eq(schema.botUsers.userId, userId));
  revalidatePath("/users");
}

export default async function UsersPage({
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
    const term = `%${sp.q.replace(/^@/, "")}%`;
    const numeric = /^\d+$/.test(sp.q.trim()) ? Number(sp.q.trim()) : null;
    const conds = [
      ilike(schema.botUsers.fullName, term),
      ilike(schema.botUsers.username, term),
    ];
    if (numeric != null) {
      conds.push(eq(schema.botUsers.userId, numeric));
    }
    filters.push(or(...conds)!);
  }
  if (sp.state === "active") filters.push(eq(schema.botUsers.isBlocked, false));
  if (sp.state === "blocked") filters.push(eq(schema.botUsers.isBlocked, true));

  const where = filters.length ? and(...filters) : undefined;

  const [rows, totalRow, subCounts] = await Promise.all([
    db
      .select()
      .from(schema.botUsers)
      .where(where)
      .orderBy(desc(schema.botUsers.lastSeenAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ n: count() }).from(schema.botUsers).where(where),
    db
      .select({
        userId: schema.subscriptions.userId,
        n: count(),
      })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.status, "active"))
      .groupBy(schema.subscriptions.userId),
  ]);

  const total = totalRow[0]?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const subsByUser = new Map<number, number>(
    subCounts.map((r) => [Number(r.userId), Number(r.n)]),
  );

  return (
    <AdminShell session={session}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <div>
            <h2 className="text-xl font-semibold">Пользователи бота</h2>
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
                <Th className="w-16">lang</Th>
                <Th className="w-24">Подписки</Th>
                <Th className="w-40">Первый раз</Th>
                <Th className="w-40">Последний раз</Th>
                <Th className="w-32">Статус</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const display = r.fullName || (r.username ? `@${r.username}` : `id:${r.userId}`);
                const subs = subsByUser.get(Number(r.userId)) ?? 0;
                return (
                  <tr key={r.userId} className="border-b border-neutral-800/60 hover:bg-neutral-800/40">
                    <Td className="text-neutral-100 max-w-[28ch]">
                      <div className="truncate">{display}</div>
                      {r.username && r.fullName ? (
                        <div className="text-xs text-neutral-500 truncate">@{r.username}</div>
                      ) : null}
                    </Td>
                    <Td className="text-neutral-400 tabular-nums">{r.userId}</Td>
                    <Td className="text-neutral-500 uppercase">{r.languageCode || "—"}</Td>
                    <Td className="text-neutral-300 tabular-nums">
                      {subs ? (
                        <Link
                          href={`/subscriptions?user=${r.userId}`}
                          className="hover:text-white underline-offset-2 hover:underline"
                        >
                          {subs}
                        </Link>
                      ) : (
                        <span className="text-neutral-600">0</span>
                      )}
                    </Td>
                    <Td className="text-neutral-400 tabular-nums whitespace-nowrap">
                      {formatDateTime(r.firstSeenAt)}
                    </Td>
                    <Td className="text-neutral-400 tabular-nums whitespace-nowrap">
                      {formatDateTime(r.lastSeenAt)}
                    </Td>
                    <Td>
                      <form action={toggleBlocked}>
                        <input type="hidden" name="user_id" value={r.userId} />
                        <input type="hidden" name="next" value={r.isBlocked ? "0" : "1"} />
                        <button
                          type="submit"
                          className={`px-2.5 py-1 rounded-md text-xs border transition ${
                            r.isBlocked
                              ? "border-rose-700/60 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                              : "border-emerald-700/60 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                          }`}
                          title={r.isBlocked ? "Кликни чтобы разблокировать" : "Кликни чтобы заблокировать"}
                        >
                          {r.isBlocked ? "заблокирован" : "активен"}
                        </button>
                      </form>
                    </Td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-neutral-500">
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
      action="/users"
      className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4"
    >
      <Field label="Поиск (имя / @username / user_id)">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Иван / @vasya / 123456" className={inputCls} />
      </Field>
      <Field label="Состояние">
        <select name="state" defaultValue={sp.state ?? "all"} className={inputCls}>
          <option value="all">все</option>
          <option value="active">активные</option>
          <option value="blocked">заблокированные</option>
        </select>
      </Field>
      <div className="flex items-end justify-end gap-2 pt-1">
        <Link
          href="/users"
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
    return `/users?${params.toString()}`;
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
