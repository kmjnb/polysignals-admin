import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { AdminShell } from "@/components/admin-shell";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/admin-guard";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

async function addChannel(formData: FormData) {
  "use server";
  await requireAdmin();
  const channelIdRaw = String(formData.get("channel_id") ?? "").trim();
  const channelUsername = String(formData.get("channel_username") ?? "").trim().replace(/^@/, "");
  const inviteLink = String(formData.get("invite_link") ?? "").trim();
  const channelId = Number(channelIdRaw);
  if (!Number.isFinite(channelId) || channelId === 0) return;
  await db.insert(schema.channelGates).values({
    channelId,
    channelUsername: channelUsername || null,
    inviteLink: inviteLink || null,
    isActive: true,
  });
  revalidatePath("/channels");
}

async function toggleActive(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = Number(formData.get("id"));
  const next = formData.get("next") === "1";
  if (!Number.isFinite(id)) return;
  await db
    .update(schema.channelGates)
    .set({ isActive: next })
    .where(eq(schema.channelGates.id, id));
  revalidatePath("/channels");
}

async function deleteChannel(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;
  await db
    .delete(schema.channelGates)
    .where(eq(schema.channelGates.id, id));
  revalidatePath("/channels");
}

export default async function ChannelsPage() {
  const session = await requireAdmin();
  const rows = await db
    .select()
    .from(schema.channelGates)
    .orderBy(desc(schema.channelGates.createdAt));

  return (
    <AdminShell session={session}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <div>
            <h2 className="text-xl font-semibold">Обязательные каналы</h2>
            <p className="text-xs text-neutral-500 mt-0.5 max-w-prose">
              Бот будет активироваться только для пользователей, которые подписаны на эти каналы.
              Если список пустой — проверка отключена.
            </p>
          </div>
        </div>

        <AddChannelForm />

        <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
          <table className="w-full text-sm">
            <thead className="text-neutral-400 text-xs uppercase tracking-wide">
              <tr className="border-b border-neutral-800">
                <Th className="w-44">channel_id</Th>
                <Th className="w-44">@username</Th>
                <Th>Invite-link</Th>
                <Th className="w-40">Создан</Th>
                <Th className="w-32">Активность</Th>
                <Th className="w-24">{" "}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-neutral-800/60 hover:bg-neutral-800/40">
                  <Td className="text-neutral-300 tabular-nums font-mono text-xs">{r.channelId}</Td>
                  <Td className="text-neutral-200">
                    {r.channelUsername ? (
                      <a
                        href={`https://t.me/${r.channelUsername}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline underline-offset-2"
                      >
                        @{r.channelUsername}
                      </a>
                    ) : (
                      <span className="text-neutral-600">—</span>
                    )}
                  </Td>
                  <Td className="text-neutral-300 max-w-[40ch]">
                    {r.inviteLink ? (
                      <a
                        href={r.inviteLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline underline-offset-2 truncate inline-block max-w-full align-bottom"
                      >
                        {r.inviteLink}
                      </a>
                    ) : (
                      <span className="text-neutral-600">—</span>
                    )}
                  </Td>
                  <Td className="text-neutral-400 tabular-nums whitespace-nowrap">
                    {formatDateTime(r.createdAt)}
                  </Td>
                  <Td>
                    <form action={toggleActive}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="next" value={r.isActive ? "0" : "1"} />
                      <button
                        type="submit"
                        className={`px-2.5 py-1 rounded-md text-xs border transition ${
                          r.isActive
                            ? "border-emerald-700/60 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                            : "border-neutral-700 bg-neutral-800/60 text-neutral-400 hover:bg-neutral-700"
                        }`}
                      >
                        {r.isActive ? "активен" : "выключен"}
                      </button>
                    </form>
                  </Td>
                  <Td>
                    <form action={deleteChannel}>
                      <input type="hidden" name="id" value={r.id} />
                      <button
                        type="submit"
                        className="px-2.5 py-1 rounded-md text-xs border border-neutral-700 text-neutral-400 hover:bg-rose-500/15 hover:text-rose-300 hover:border-rose-700/60 transition"
                        title="Удалить канал-гейт"
                      >
                        удалить
                      </button>
                    </form>
                  </Td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-neutral-500">
                    Каналов-гейтов нет — добавь первый формой выше
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}

function AddChannelForm() {
  return (
    <form
      action={addChannel}
      className="grid grid-cols-1 sm:grid-cols-4 gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4"
    >
      <Field label="channel_id (например -1001234567890)">
        <input
          name="channel_id"
          type="text"
          required
          placeholder="-100..."
          className={inputCls}
        />
      </Field>
      <Field label="@username (опционально)">
        <input name="channel_username" placeholder="my_channel" className={inputCls} />
      </Field>
      <Field label="Invite-link (опционально, для приватных)">
        <input name="invite_link" placeholder="https://t.me/+..." className={inputCls} />
      </Field>
      <div className="flex items-end justify-end gap-2 pt-1">
        <button
          type="submit"
          className="px-3 py-1.5 text-sm rounded-md bg-white text-black hover:bg-neutral-200"
        >
          Добавить канал
        </button>
      </div>
    </form>
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
