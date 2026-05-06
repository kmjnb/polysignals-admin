import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import Link from "next/link";
import { revalidatePath } from "next/cache";

import { AdminShell } from "@/components/admin-shell";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/admin-guard";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Tab = "subs" | "plans";

type SP = {
  tab?: Tab;
  q?: string;
  user?: string;
  status?: "all" | "active" | "refunded" | "expired";
  page?: string;
};

async function togglePlanActive(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = Number(formData.get("id"));
  const next = formData.get("next") === "1";
  if (!Number.isFinite(id)) return;
  await db
    .update(schema.subscriptionPlans)
    .set({ isActive: next })
    .where(eq(schema.subscriptionPlans.id, id));
  revalidatePath("/subscriptions");
}

async function createPlan(formData: FormData) {
  "use server";
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const starsPrice = Number(formData.get("stars_price"));
  const durationRaw = String(formData.get("duration_days") ?? "").trim();
  const durationDays = durationRaw === "" ? null : Number(durationRaw);
  if (!name || !Number.isFinite(starsPrice) || starsPrice <= 0) return;
  if (durationDays !== null && (!Number.isFinite(durationDays) || durationDays <= 0)) return;
  await db.insert(schema.subscriptionPlans).values({
    name,
    starsPrice,
    durationDays,
    isActive: true,
  });
  revalidatePath("/subscriptions");
}

async function refundSubscription(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;

  const [sub] = await db
    .select({
      id: schema.subscriptions.id,
      userId: schema.subscriptions.userId,
      telegramChargeId: schema.subscriptions.telegramChargeId,
      status: schema.subscriptions.status,
    })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.id, id))
    .limit(1);

  if (!sub) return;
  if (sub.status === "refunded") {
    revalidatePath("/subscriptions");
    return;
  }

  // Refund must come from the bot that received the Stars (bizlogger),
  // not the admin login bot. BROADCAST_BOT_TOKEN already represents the
  // bizlogger bot (broadcasts go through the same token).
  const refundToken = env.BROADCAST_BOT_TOKEN;
  let refundError: string | null = null;
  if (sub.telegramChargeId && refundToken) {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${refundToken}/refundStarPayment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: Number(sub.userId),
            telegram_payment_charge_id: sub.telegramChargeId,
          }),
        },
      );
      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; description?: string }
        | null;
      if (!data?.ok) {
        refundError = data?.description || `HTTP ${res.status}`;
      }
    } catch (e) {
      refundError = e instanceof Error ? e.message : String(e);
    }
  } else if (!sub.telegramChargeId) {
    refundError = "no telegram_charge_id stored";
  } else {
    refundError = "BROADCAST_BOT_TOKEN not configured";
  }

  if (refundError) {
    console.warn(`[refund] sub=${id}: ${refundError}`);
    return;
  }

  await db
    .update(schema.subscriptions)
    .set({ status: "refunded" })
    .where(eq(schema.subscriptions.id, id));
  revalidatePath("/subscriptions");
}

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const session = await requireAdmin();
  const sp = await searchParams;
  const tab: Tab = sp.tab === "plans" ? "plans" : "subs";

  return (
    <AdminShell session={session}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <h2 className="text-xl font-semibold">Подписки</h2>
          <nav className="flex gap-1 text-sm">
            <TabLink href="/subscriptions?tab=subs" active={tab === "subs"}>
              Активные подписки
            </TabLink>
            <TabLink href="/subscriptions?tab=plans" active={tab === "plans"}>
              Тарифы
            </TabLink>
          </nav>
        </div>

        {tab === "subs" ? <SubsTab sp={sp} /> : <PlansTab />}
      </div>
    </AdminShell>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-md transition ${
        active
          ? "bg-white text-black"
          : "text-neutral-300 hover:bg-neutral-800/60 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}

async function SubsTab({ sp }: { sp: SP }) {
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const filters = [];
  if (sp.user) {
    const n = Number(sp.user);
    if (Number.isFinite(n)) filters.push(eq(schema.subscriptions.userId, n));
  }
  if (sp.status === "active") filters.push(eq(schema.subscriptions.status, "active"));
  else if (sp.status === "refunded") filters.push(eq(schema.subscriptions.status, "refunded"));
  else if (sp.status === "expired") filters.push(eq(schema.subscriptions.status, "expired"));

  const where = filters.length ? and(...filters) : undefined;

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: schema.subscriptions.id,
        userId: schema.subscriptions.userId,
        starsAmount: schema.subscriptions.starsAmount,
        telegramChargeId: schema.subscriptions.telegramChargeId,
        status: schema.subscriptions.status,
        paidAt: schema.subscriptions.paidAt,
        expiresAt: schema.subscriptions.expiresAt,
        userName: schema.botUsers.fullName,
        userUsername: schema.botUsers.username,
      })
      .from(schema.subscriptions)
      .leftJoin(schema.botUsers, eq(schema.botUsers.userId, schema.subscriptions.userId))
      .where(where)
      .orderBy(desc(schema.subscriptions.paidAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ n: count() }).from(schema.subscriptions).where(where),
  ]);

  const total = totalRow[0]?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <p className="text-xs text-neutral-500 -mt-2">
        Найдено: <span className="text-neutral-300 tabular-nums">{total}</span>
      </p>

      <SubsFilters sp={sp} />

      <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
        <table className="w-full text-sm">
          <thead className="text-neutral-400 text-xs uppercase tracking-wide">
            <tr className="border-b border-neutral-800">
              <Th>Пользователь</Th>
              <Th className="w-32">user_id</Th>
              <Th className="w-24">⭐ Stars</Th>
              <Th className="w-40">Куплено</Th>
              <Th className="w-40">Истекает</Th>
              <Th className="w-28">Статус</Th>
              <Th className="w-28">charge_id</Th>
              <Th className="w-32">{" "}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const display =
                r.userName ||
                (r.userUsername ? `@${r.userUsername}` : `id:${r.userId}`);
              return (
                <tr key={r.id} className="border-b border-neutral-800/60 hover:bg-neutral-800/40">
                  <Td className="text-neutral-100 max-w-[28ch]">
                    <Link
                      href={`/users?q=${r.userId}`}
                      className="hover:underline underline-offset-2"
                    >
                      <div className="truncate">{display}</div>
                    </Link>
                    {r.userUsername && r.userName ? (
                      <div className="text-xs text-neutral-500 truncate">@{r.userUsername}</div>
                    ) : null}
                  </Td>
                  <Td className="text-neutral-400 tabular-nums">{r.userId}</Td>
                  <Td className="text-neutral-200 tabular-nums">{r.starsAmount}</Td>
                  <Td className="text-neutral-400 tabular-nums whitespace-nowrap">
                    {formatDateTime(r.paidAt)}
                  </Td>
                  <Td className="text-neutral-400 tabular-nums whitespace-nowrap">
                    {r.expiresAt ? (
                      formatDateTime(r.expiresAt)
                    ) : (
                      <span className="text-neutral-500">∞ навсегда</span>
                    )}
                  </Td>
                  <Td>
                    <StatusBadge status={r.status} />
                  </Td>
                  <Td className="text-neutral-500 font-mono text-xs">
                    {r.telegramChargeId ? r.telegramChargeId.slice(0, 10) + "…" : "—"}
                  </Td>
                  <Td>
                    {r.status === "active" ? (
                      <form action={refundSubscription}>
                        <input type="hidden" name="id" value={r.id} />
                        <button
                          type="submit"
                          className="px-2.5 py-1 rounded-md text-xs border border-neutral-700 text-neutral-300 hover:bg-rose-500/15 hover:text-rose-300 hover:border-rose-700/60 transition"
                          title="Пометить подписку как возвращённую"
                        >
                          возврат
                        </button>
                      </form>
                    ) : null}
                  </Td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-neutral-500">
                  Подписок ещё нет
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Pagination sp={sp} page={page} totalPages={totalPages} />
    </>
  );
}

async function PlansTab() {
  const plans = await db
    .select()
    .from(schema.subscriptionPlans)
    .orderBy(desc(schema.subscriptionPlans.createdAt));

  return (
    <>
      <CreatePlanForm />

      <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
        <table className="w-full text-sm">
          <thead className="text-neutral-400 text-xs uppercase tracking-wide">
            <tr className="border-b border-neutral-800">
              <Th>Название</Th>
              <Th className="w-28">⭐ Stars</Th>
              <Th className="w-32">Длительность</Th>
              <Th className="w-40">Создан</Th>
              <Th className="w-32">Активность</Th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id} className="border-b border-neutral-800/60 hover:bg-neutral-800/40">
                <Td className="text-neutral-100">{p.name}</Td>
                <Td className="text-neutral-200 tabular-nums">{p.starsPrice}</Td>
                <Td className="text-neutral-300">
                  {p.durationDays === null ? (
                    <span className="text-neutral-200">∞ навсегда</span>
                  ) : (
                    `${p.durationDays} дн.`
                  )}
                </Td>
                <Td className="text-neutral-400 tabular-nums whitespace-nowrap">
                  {formatDateTime(p.createdAt)}
                </Td>
                <Td>
                  <form action={togglePlanActive}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="next" value={p.isActive ? "0" : "1"} />
                    <button
                      type="submit"
                      className={`px-2.5 py-1 rounded-md text-xs border transition ${
                        p.isActive
                          ? "border-emerald-700/60 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                          : "border-neutral-700 bg-neutral-800/60 text-neutral-400 hover:bg-neutral-700"
                      }`}
                    >
                      {p.isActive ? "активен" : "выключен"}
                    </button>
                  </form>
                </Td>
              </tr>
            ))}
            {plans.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-neutral-500">
                  Тарифов ещё нет — создай первый формой выше
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CreatePlanForm() {
  return (
    <form
      action={createPlan}
      className="grid grid-cols-1 sm:grid-cols-4 gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4"
    >
      <Field label="Название тарифа">
        <input name="name" required placeholder="Месяц / VIP / навсегда" className={inputCls} />
      </Field>
      <Field label="Цена в Stars ⭐">
        <input
          name="stars_price"
          type="number"
          min="1"
          step="1"
          required
          placeholder="100"
          className={inputCls}
        />
      </Field>
      <Field label="Длительность (дней, пусто = навсегда)">
        <input
          name="duration_days"
          type="number"
          min="1"
          step="1"
          placeholder="30"
          className={inputCls}
        />
      </Field>
      <div className="flex items-end justify-end gap-2 pt-1">
        <button
          type="submit"
          className="px-3 py-1.5 text-sm rounded-md bg-white text-black hover:bg-neutral-200"
        >
          Создать тариф
        </button>
      </div>
    </form>
  );
}

function SubsFilters({ sp }: { sp: SP }) {
  return (
    <form
      method="GET"
      action="/subscriptions"
      className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4"
    >
      <input type="hidden" name="tab" value="subs" />
      <Field label="user_id">
        <input name="user" defaultValue={sp.user ?? ""} placeholder="123456" className={inputCls} />
      </Field>
      <Field label="Статус">
        <select name="status" defaultValue={sp.status ?? "all"} className={inputCls}>
          <option value="all">все</option>
          <option value="active">активные</option>
          <option value="refunded">возвращённые</option>
          <option value="expired">истёкшие</option>
        </select>
      </Field>
      <div className="flex items-end justify-end gap-2 pt-1">
        <Link
          href="/subscriptions?tab=subs"
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

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "active"
      ? "border-emerald-700/60 bg-emerald-500/10 text-emerald-300"
      : status === "refunded"
        ? "border-rose-700/60 bg-rose-500/10 text-rose-300"
        : "border-neutral-700 bg-neutral-800/60 text-neutral-400";
  const ru =
    status === "active" ? "активная" :
    status === "refunded" ? "возврат" :
    status === "expired" ? "истекла" : status;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-md text-xs border ${cls}`}>{ru}</span>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`text-left px-3 py-2 font-medium ${className}`}>{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 align-top ${className}`}>{children}</td>;
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
    params.set("tab", "subs");
    for (const [k, v] of Object.entries(sp)) {
      if (k === "tab" || k === "page") continue;
      if (typeof v === "string" && v) params.set(k, v);
    }
    params.set("page", String(p));
    return `/subscriptions?${params.toString()}`;
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
