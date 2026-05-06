"use client";

import { useEffect, useState } from "react";

import { createInvoiceLinkForPlan } from "./actions";

type Plan = {
  id: number;
  name: string;
  starsPrice: number;
  durationDays: number | null;
};

type WebApp = {
  initData: string;
  initDataUnsafe?: { user?: { id: number; first_name?: string } };
  ready: () => void;
  expand: () => void;
  HapticFeedback?: { notificationOccurred: (type: "success" | "error") => void };
  openInvoice: (
    url: string,
    callback: (status: "paid" | "cancelled" | "failed" | "pending") => void,
  ) => void;
  showAlert: (message: string) => void;
  close: () => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: WebApp };
  }
}

export function MiniAppClient({ plans }: { plans: Plan[] }) {
  const [tg, setTg] = useState<WebApp | null>(null);
  const [busyPlanId, setBusyPlanId] = useState<number | null>(null);
  const [paidPlanId, setPaidPlanId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const w = window.Telegram?.WebApp;
    if (!w) {
      setError("Открой через Telegram (этот mini-app не работает в обычном браузере).");
      return;
    }
    w.ready();
    w.expand();
    setTg(w);
  }, []);

  async function buy(planId: number) {
    if (!tg) return;
    setError(null);
    setBusyPlanId(planId);
    try {
      const res = await createInvoiceLinkForPlan(tg.initData, planId);
      if (!res.ok) {
        setError(res.error);
        tg.HapticFeedback?.notificationOccurred("error");
        setBusyPlanId(null);
        return;
      }
      tg.openInvoice(res.invoice_link, (status) => {
        setBusyPlanId(null);
        if (status === "paid") {
          tg.HapticFeedback?.notificationOccurred("success");
          setPaidPlanId(planId);
        } else if (status === "failed") {
          tg.HapticFeedback?.notificationOccurred("error");
          setError("Оплата не прошла. Попробуй ещё раз.");
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      tg.HapticFeedback?.notificationOccurred("error");
      setBusyPlanId(null);
    }
  }

  const userName = tg?.initDataUnsafe?.user?.first_name;

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {userName ? `Привет, ${userName}` : "polysignals"}
        </h1>
        <p className="mt-1 text-sm text-[var(--tg-theme-hint-color,#a3a3a3)]">
          Выбери тариф — оплата проходит звёздами Telegram.
        </p>
      </header>

      {error ? (
        <div className="mb-4 rounded-lg border border-rose-700/60 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {plans.length === 0 ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-6 text-center text-sm text-neutral-400">
          Тарифов пока нет — загляни позже.
        </div>
      ) : (
        <ul className="space-y-3">
          {plans.map((p) => {
            const duration =
              p.durationDays === null ? "навсегда" : `${p.durationDays} дн.`;
            const isPaid = paidPlanId === p.id;
            const isBusy = busyPlanId === p.id;
            return (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--tg-theme-section-separator-color,#262626)] bg-[var(--tg-theme-secondary-bg-color,#131313)] px-4 py-3"
              >
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-[var(--tg-theme-hint-color,#a3a3a3)]">
                    {duration} · {p.starsPrice} ⭐
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!tg || isBusy || isPaid}
                  onClick={() => buy(p.id)}
                  className="shrink-0 rounded-lg bg-[var(--tg-theme-button-color,#38bdf8)] px-4 py-2 text-sm font-semibold text-[var(--tg-theme-button-text-color,#0a0a0a)] disabled:opacity-50"
                >
                  {isPaid ? "✅ оплачено" : isBusy ? "…" : `${p.starsPrice} ⭐`}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="mt-8 text-center text-[11px] text-[var(--tg-theme-hint-color,#a3a3a3)]">
        После оплаты вернись в чат с ботом — подписка активна сразу.
      </footer>
    </main>
  );
}
