import { count } from "drizzle-orm";

import { AdminShell } from "@/components/admin-shell";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireAdmin();

  const [conns, msgs, users, subs] = await Promise.all([
    db.select({ n: count() }).from(schema.businessConnections),
    db.select({ n: count() }).from(schema.messages),
    db.select({ n: count() }).from(schema.botUsers),
    db.select({ n: count() }).from(schema.subscriptions),
  ]);

  const stats: { label: string; value: number; href?: string }[] = [
    { label: "Подключённые business-аккаунты", value: conns[0]?.n ?? 0, href: "/connections" },
    { label: "Залогированные сообщения", value: msgs[0]?.n ?? 0, href: "/messages" },
    { label: "Пользователи бота", value: users[0]?.n ?? 0, href: "/users" },
    { label: "Активные подписки", value: subs[0]?.n ?? 0, href: "/subscriptions" },
  ];

  return (
    <AdminShell session={session}>
      <section>
        <h2 className="text-sm uppercase tracking-wide text-neutral-500 mb-3">
          Dashboard
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s) => (
            <a
              key={s.label}
              href={s.href}
              className="rounded-lg border border-neutral-800 bg-neutral-900 p-5 hover:border-neutral-700 transition"
            >
              <div className="text-xs uppercase tracking-wide text-neutral-500">
                {s.label}
              </div>
              <div className="mt-2 text-3xl font-semibold tabular-nums">
                {s.value}
              </div>
            </a>
          ))}
        </div>
      </section>
    </AdminShell>
  );
}
