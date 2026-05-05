import { desc, eq, inArray, max, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/admin-guard";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const session = await requireAdmin();
  const { userId: userIdRaw } = await params;
  const userId = Number(userIdRaw);
  if (!Number.isFinite(userId)) notFound();

  const [userRow, connections, subs] = await Promise.all([
    db
      .select()
      .from(schema.botUsers)
      .where(eq(schema.botUsers.userId, userId))
      .limit(1),
    db
      .select()
      .from(schema.businessConnections)
      .where(eq(schema.businessConnections.userId, userId))
      .orderBy(desc(schema.businessConnections.createdAt)),
    db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId))
      .orderBy(desc(schema.subscriptions.paidAt)),
  ]);

  const user = userRow[0];

  const connIds = connections.map((c) => c.id);
  let chats: Array<{
    connId: string;
    chatId: number;
    chatLabel: string | null;
    msgCount: number;
    lastAt: Date | null;
  }> = [];

  if (connIds.length > 0) {
    const rows = await db
      .select({
        connId: schema.messages.businessConnectionId,
        chatId: schema.messages.chatId,
        chatLabel: max(schema.messages.chatLabel),
        msgCount: sql<number>`count(*)::int`,
        lastAt: max(schema.messages.createdAt),
      })
      .from(schema.messages)
      .where(inArray(schema.messages.businessConnectionId, connIds))
      .groupBy(schema.messages.businessConnectionId, schema.messages.chatId)
      .orderBy(desc(max(schema.messages.createdAt)));
    chats = rows.map((r) => ({
      connId: r.connId,
      chatId: Number(r.chatId),
      chatLabel: r.chatLabel ?? null,
      msgCount: Number(r.msgCount),
      lastAt: r.lastAt ?? null,
    }));
  }

  const display =
    user?.fullName ||
    (user?.username ? `@${user.username}` : `id:${userId}`);

  return (
    <AdminShell session={session}>
      <div className="space-y-5 max-w-5xl">
        <div>
          <Link
            href="/users"
            className="text-sm text-neutral-400 hover:text-neutral-200"
          >
            ← к пользователям
          </Link>
          <div className="flex items-center gap-3 mt-1">
            <h2 className="text-xl font-semibold">{display}</h2>
            {user ? (
              user.isBlocked ? (
                <Badge cls="border-rose-700/60 bg-rose-500/10 text-rose-300">
                  заблокирован
                </Badge>
              ) : (
                <Badge cls="border-emerald-700/60 bg-emerald-500/10 text-emerald-300">
                  активен
                </Badge>
              )
            ) : (
              <Badge cls="border-neutral-700 bg-neutral-800 text-neutral-400">
                нет в bot_users
              </Badge>
            )}
          </div>
          <div className="text-xs text-neutral-500 mt-1 tabular-nums">
            user_id <span className="text-neutral-300">{userId}</span>
            {user?.username ? <> · @{user.username}</> : null}
            {user?.languageCode ? (
              <> · lang {user.languageCode.toUpperCase()}</>
            ) : null}
            {user ? (
              <>
                {" "}
                · первый раз {formatDateTime(user.firstSeenAt)} · последний{" "}
                {formatDateTime(user.lastSeenAt)}
              </>
            ) : null}
          </div>
        </div>

        <Card title="Подписки">
          {subs.length === 0 ? (
            <p className="text-sm text-neutral-500">Нет подписок.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-neutral-800">
              <table className="w-full text-sm">
                <thead className="text-neutral-400 text-xs uppercase tracking-wide">
                  <tr className="border-b border-neutral-800">
                    <Th className="w-24">⭐ Stars</Th>
                    <Th className="w-32">Статус</Th>
                    <Th className="w-44">Куплено</Th>
                    <Th className="w-44">Истекает</Th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map((s) => (
                    <tr key={s.id} className="border-b border-neutral-800/60">
                      <Td className="tabular-nums text-neutral-200">
                        {s.starsAmount}
                      </Td>
                      <Td>
                        <Badge
                          cls={
                            s.status === "active"
                              ? "border-emerald-700/60 bg-emerald-500/10 text-emerald-300"
                              : s.status === "refunded"
                                ? "border-rose-700/60 bg-rose-500/10 text-rose-300"
                                : "border-neutral-700 bg-neutral-800/60 text-neutral-400"
                          }
                        >
                          {s.status}
                        </Badge>
                      </Td>
                      <Td className="text-neutral-400 tabular-nums whitespace-nowrap">
                        {formatDateTime(s.paidAt)}
                      </Td>
                      <Td className="text-neutral-400 tabular-nums whitespace-nowrap">
                        {s.expiresAt ? (
                          formatDateTime(s.expiresAt)
                        ) : (
                          <span className="text-neutral-500">∞</span>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Бизнес-подключения">
          {connections.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Этот пользователь ещё не подключал бота к Telegram Business.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-neutral-800">
              <table className="w-full text-sm">
                <thead className="text-neutral-400 text-xs uppercase tracking-wide">
                  <tr className="border-b border-neutral-800">
                    <Th>connection_id</Th>
                    <Th className="w-32">состояние</Th>
                    <Th className="w-32">can_reply</Th>
                    <Th className="w-44">создан</Th>
                  </tr>
                </thead>
                <tbody>
                  {connections.map((c) => (
                    <tr key={c.id} className="border-b border-neutral-800/60">
                      <Td className="text-neutral-300 font-mono text-xs">
                        {c.id}
                      </Td>
                      <Td>
                        {c.isEnabled ? (
                          <Badge cls="border-emerald-700/60 bg-emerald-500/10 text-emerald-300">
                            включён
                          </Badge>
                        ) : (
                          <Badge cls="border-neutral-700 bg-neutral-800 text-neutral-400">
                            выключен
                          </Badge>
                        )}
                      </Td>
                      <Td className="text-neutral-400">
                        {c.canReply ? "да" : "нет"}
                      </Td>
                      <Td className="text-neutral-400 tabular-nums whitespace-nowrap">
                        {formatDateTime(c.createdAt)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title={`Чаты (${chats.length})`}
          subtitle="Кликай — откроется тред с сообщениями (read-only, ничего отправлять оттуда нельзя)."
        >
          {chats.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Залогированных сообщений пока нет.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-neutral-800">
              <table className="w-full text-sm">
                <thead className="text-neutral-400 text-xs uppercase tracking-wide">
                  <tr className="border-b border-neutral-800">
                    <Th>Чат</Th>
                    <Th className="w-32">chat_id</Th>
                    <Th className="w-28">сообщений</Th>
                    <Th className="w-44">последнее</Th>
                  </tr>
                </thead>
                <tbody>
                  {chats.map((c) => (
                    <tr
                      key={`${c.connId}-${c.chatId}`}
                      className="border-b border-neutral-800/60 hover:bg-neutral-800/40"
                    >
                      <Td className="text-neutral-100">
                        <Link
                          href={`/chats/${encodeURIComponent(c.connId)}/${c.chatId}`}
                          className="hover:underline underline-offset-2"
                        >
                          {c.chatLabel || (
                            <span className="text-neutral-500">
                              без названия
                            </span>
                          )}
                        </Link>
                      </Td>
                      <Td className="text-neutral-400 tabular-nums">
                        {c.chatId}
                      </Td>
                      <Td className="text-neutral-300 tabular-nums">
                        {c.msgCount}
                      </Td>
                      <Td className="text-neutral-400 tabular-nums whitespace-nowrap">
                        {c.lastAt ? formatDateTime(c.lastAt) : "—"}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm uppercase tracking-wide text-neutral-400">
          {title}
        </h3>
        {subtitle ? (
          <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Badge({
  cls,
  children,
}: {
  cls: string;
  children: React.ReactNode;
}) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-md text-xs border ${cls}`}>
      {children}
    </span>
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
