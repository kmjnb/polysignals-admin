import Script from "next/script";

import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-white p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">polysignals admin</h1>
          <p className="text-sm text-neutral-400">
            Войдите через Telegram, чтобы продолжить.
          </p>
        </div>

        <ErrorBanner searchParams={searchParams} />

        <div className="flex justify-center">
          {env.TELEGRAM_BOT_USERNAME ? (
            <>
              <Script
                src="https://telegram.org/js/telegram-widget.js?22"
                data-telegram-login={env.TELEGRAM_BOT_USERNAME}
                data-size="large"
                data-radius="6"
                data-onauth="onTelegramAuth(user)"
                data-request-access="write"
                strategy="afterInteractive"
              />
              <Script id="tg-onauth" strategy="afterInteractive">
                {`
                  function onTelegramAuth(user) {
                    fetch('/api/auth/telegram', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(user),
                    }).then(async (r) => {
                      if (r.ok) { window.location.href = '/'; }
                      else {
                        const data = await r.json().catch(() => ({}));
                        window.location.href = '/login?error=' + (data.error || 'unknown');
                      }
                    });
                  }
                `}
              </Script>
            </>
          ) : (
            <p className="text-sm text-amber-400">
              Не задан TELEGRAM_BOT_USERNAME — настройте env-переменные.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

async function ErrorBanner({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  if (!sp.error) return null;
  const map: Record<string, string> = {
    not_admin: "Этот Telegram-аккаунт не входит в список администраторов.",
    bad_hash: "Telegram не подтвердил подлинность подписи.",
    auth_date_too_old: "Сессия Telegram-логина устарела, попробуй снова.",
    bad_payload: "Некорректные данные от Telegram.",
  };
  return (
    <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
      {map[sp.error] ?? `Ошибка: ${sp.error}`}
    </div>
  );
}
