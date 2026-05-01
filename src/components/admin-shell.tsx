import Link from "next/link";

import { type SessionPayload } from "@/lib/session";

const NAV: { href: string; label: string }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/messages", label: "Сообщения" },
  { href: "/connections", label: "Аккаунты" },
  { href: "/users", label: "Пользователи" },
  { href: "/subscriptions", label: "Подписки" },
  { href: "/channels", label: "Каналы" },
  { href: "/broadcasts", label: "Рассылки" },
];

export function AdminShell({
  session,
  children,
}: {
  session: SessionPayload;
  children: React.ReactNode;
}) {
  const who =
    session.name ?? (session.username ? `@${session.username}` : `id:${session.uid}`);
  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      <header className="border-b border-neutral-800 px-6 py-3 flex items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-base font-semibold">
            polysignals
          </Link>
          <nav className="hidden md:flex items-center gap-1 text-sm">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="px-3 py-1.5 rounded-md text-neutral-300 hover:text-white hover:bg-neutral-800/60 transition"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="text-sm text-neutral-400 flex items-center gap-3">
          <span className="hidden sm:inline">{who}</span>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="hover:text-white">
              выйти
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
