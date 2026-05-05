"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
} from "react";

import {
  createBroadcastAction,
  uploadMediaAction,
  type AudienceType,
  type BroadcastButton,
  type MediaType,
} from "../actions";

type Step = 1 | 2 | 3;
type Mode = "draft" | "now" | "scheduled";

interface MediaState {
  type: MediaType;
  fileId: string;
  fileName?: string;
}

interface Counts {
  all: number;
  connected: number;
}

const inputCls =
  "w-full rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600";

export function Wizard({ counts }: { counts: Counts }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);

  const [title, setTitle] = useState("");
  const [audience, setAudience] = useState<AudienceType>("all");
  const [manualRaw, setManualRaw] = useState("");

  const [text, setText] = useState("");
  const [parseMode, setParseMode] = useState<"markdown_v2" | null>(null);
  const [media, setMedia] = useState<MediaState | null>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [buttons, setButtons] = useState<BroadcastButton[][]>([]);

  const [mode, setMode] = useState<Mode>("now");
  const [scheduledLocal, setScheduledLocal] = useState("");

  const [submitting, startSubmit] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const manualIds = useMemo(() => parseManualIds(manualRaw), [manualRaw]);
  const audienceCount =
    audience === "all"
      ? counts.all
      : audience === "connected"
        ? counts.connected
        : manualIds.length;

  const step1Valid =
    title.trim().length > 0 &&
    (audience !== "manual" || manualIds.length > 0);
  const step2Valid = text.trim().length > 0 || media !== null;

  function next() {
    if (step === 1 && !step1Valid) return;
    if (step === 2 && !step2Valid) return;
    setStep((s) => (s === 1 ? 2 : 3));
  }
  function back() {
    setStep((s) => (s === 3 ? 2 : 1));
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const t = mediaTypeForFile(f);
    setMediaUploading(true);
    setMediaError(null);
    try {
      const fd = new FormData();
      fd.set("file", f);
      fd.set("type", t);
      const r = await uploadMediaAction(fd);
      if (r.ok) {
        setMedia({ type: r.type, fileId: r.fileId, fileName: r.fileName });
      } else {
        setMediaError(r.error);
      }
    } catch (err) {
      setMediaError((err as Error).message);
    } finally {
      setMediaUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function submitFor(targetMode: Mode) {
    setSubmitError(null);
    startSubmit(async () => {
      const cleanedButtons = buttons
        .map((row) => row.filter((b) => b.text.trim() && b.url.trim()))
        .filter((row) => row.length > 0);
      const r = await createBroadcastAction({
        title: title.trim(),
        audience,
        manualUserIds: audience === "manual" ? manualIds : undefined,
        payload: {
          text: text.trim() || null,
          parseMode,
          media,
          buttons: cleanedButtons.length ? cleanedButtons : null,
        },
        mode: targetMode,
        scheduledAt:
          targetMode === "scheduled" && scheduledLocal
            ? new Date(scheduledLocal).toISOString()
            : undefined,
      });
      if (r.ok) {
        router.push(`/broadcasts/${r.id}`);
      } else {
        setSubmitError(r.error);
      }
    });
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Новая рассылка</h2>
        <Link
          href="/broadcasts"
          className="text-sm text-neutral-400 hover:text-neutral-200"
        >
          ← к списку
        </Link>
      </div>

      <Stepper step={step} />

      {step === 1 ? (
        <Step1
          title={title}
          setTitle={setTitle}
          audience={audience}
          setAudience={setAudience}
          manualRaw={manualRaw}
          setManualRaw={setManualRaw}
          counts={counts}
          manualCount={manualIds.length}
        />
      ) : null}

      {step === 2 ? (
        <Step2
          text={text}
          setText={setText}
          parseMode={parseMode}
          setParseMode={setParseMode}
          media={media}
          mediaUploading={mediaUploading}
          mediaError={mediaError}
          fileInputRef={fileInputRef}
          onFileChange={handleFileChange}
          onClearMedia={() => setMedia(null)}
          buttons={buttons}
          setButtons={setButtons}
        />
      ) : null}

      {step === 3 ? (
        <Step3
          title={title}
          audience={audience}
          audienceCount={audienceCount}
          text={text}
          parseMode={parseMode}
          media={media}
          buttons={buttons}
          mode={mode}
          setMode={setMode}
          scheduledLocal={scheduledLocal}
          setScheduledLocal={setScheduledLocal}
        />
      ) : null}

      {submitError ? (
        <div className="rounded-md border border-rose-700/60 bg-rose-500/10 text-rose-300 text-sm px-3 py-2">
          {submitError}
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-neutral-800 pt-4">
        <div>
          {step > 1 ? (
            <button
              type="button"
              onClick={back}
              className="px-3 py-1.5 text-sm rounded-md border border-neutral-700 text-neutral-300 hover:bg-neutral-800/60"
              disabled={submitting}
            >
              ← Назад
            </button>
          ) : null}
        </div>
        <div className="flex gap-2">
          {step < 3 ? (
            <button
              type="button"
              onClick={next}
              disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
              className="px-4 py-1.5 text-sm rounded-md bg-white text-black hover:bg-neutral-200 disabled:opacity-40 disabled:hover:bg-white"
            >
              Далее →
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => submitFor("draft")}
                disabled={submitting}
                className="px-3 py-1.5 text-sm rounded-md border border-neutral-700 text-neutral-300 hover:bg-neutral-800/60 disabled:opacity-40"
              >
                Сохранить черновик
              </button>
              <button
                type="button"
                onClick={() => submitFor(mode === "scheduled" ? "scheduled" : "now")}
                disabled={
                  submitting ||
                  (mode === "scheduled" && !scheduledLocal) ||
                  audienceCount === 0
                }
                className="px-4 py-1.5 text-sm rounded-md bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-40 disabled:hover:bg-emerald-500"
              >
                {submitting
                  ? "…"
                  : mode === "scheduled"
                    ? "Запланировать"
                    : "Запустить сейчас"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const items: { n: Step; label: string }[] = [
    { n: 1, label: "Кому" },
    { n: 2, label: "Что отправляем" },
    { n: 3, label: "Когда" },
  ];
  return (
    <ol className="flex gap-2 text-sm">
      {items.map((it) => {
        const active = it.n === step;
        const done = it.n < step;
        return (
          <li
            key={it.n}
            className={`flex-1 rounded-md border px-3 py-2 ${
              active
                ? "border-white bg-neutral-900 text-white"
                : done
                  ? "border-emerald-700/60 bg-emerald-500/5 text-emerald-300"
                  : "border-neutral-800 bg-neutral-900/40 text-neutral-500"
            }`}
          >
            <span className="text-xs uppercase tracking-wide opacity-70 mr-2">
              шаг {it.n}
            </span>
            {it.label}
          </li>
        );
      })}
    </ol>
  );
}

function Step1({
  title,
  setTitle,
  audience,
  setAudience,
  manualRaw,
  setManualRaw,
  counts,
  manualCount,
}: {
  title: string;
  setTitle: (s: string) => void;
  audience: AudienceType;
  setAudience: (a: AudienceType) => void;
  manualRaw: string;
  setManualRaw: (s: string) => void;
  counts: Counts;
  manualCount: number;
}) {
  return (
    <div className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <Field label="Заголовок (видно только тебе в списке)">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="например, Анонс v2.0"
          className={inputCls}
          maxLength={120}
          autoFocus
        />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-xs uppercase tracking-wide text-neutral-500 mb-1">
          Аудитория
        </legend>
        <AudienceOption
          checked={audience === "all"}
          onChange={() => setAudience("all")}
          title="Все пользователи бота"
          subtitle={`${counts.all} получателей (bot_users, исключая заблокированных)`}
        />
        <AudienceOption
          checked={audience === "connected"}
          onChange={() => setAudience("connected")}
          title="Только владельцы business-подключений"
          subtitle={`${counts.connected} получателей (business_connections, is_enabled=true)`}
        />
        <AudienceOption
          checked={audience === "manual"}
          onChange={() => setAudience("manual")}
          title="Список user_id вручную"
          subtitle={
            audience === "manual"
              ? `${manualCount} валидных id`
              : "вставишь список ниже"
          }
        />
        {audience === "manual" ? (
          <textarea
            value={manualRaw}
            onChange={(e) => setManualRaw(e.target.value)}
            rows={5}
            placeholder="123456&#10;789012&#10;или через запятую: 123, 456, 789"
            className={`${inputCls} font-mono text-xs`}
          />
        ) : null}
      </fieldset>
    </div>
  );
}

function AudienceOption({
  checked,
  onChange,
  title,
  subtitle,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-md border px-3 py-2 cursor-pointer transition ${
        checked
          ? "border-white bg-neutral-800/60"
          : "border-neutral-800 hover:bg-neutral-800/40"
      }`}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="mt-1 accent-white"
      />
      <span className="flex-1">
        <span className="block text-sm text-neutral-100">{title}</span>
        <span className="block text-xs text-neutral-500 mt-0.5">{subtitle}</span>
      </span>
    </label>
  );
}

function Step2({
  text,
  setText,
  parseMode,
  setParseMode,
  media,
  mediaUploading,
  mediaError,
  fileInputRef,
  onFileChange,
  onClearMedia,
  buttons,
  setButtons,
}: {
  text: string;
  setText: (s: string) => void;
  parseMode: "markdown_v2" | null;
  setParseMode: (p: "markdown_v2" | null) => void;
  media: MediaState | null;
  mediaUploading: boolean;
  mediaError: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onClearMedia: () => void;
  buttons: BroadcastButton[][];
  setButtons: (b: BroadcastButton[][]) => void;
}) {
  function addRow() {
    setButtons([...buttons, [{ text: "", url: "" }]]);
  }
  function addBtn(rowIdx: number) {
    const next = buttons.map((r, i) =>
      i === rowIdx ? [...r, { text: "", url: "" }] : r,
    );
    setButtons(next);
  }
  function updateBtn(
    rowIdx: number,
    btnIdx: number,
    patch: Partial<BroadcastButton>,
  ) {
    const next = buttons.map((r, i) =>
      i === rowIdx ? r.map((b, j) => (j === btnIdx ? { ...b, ...patch } : b)) : r,
    );
    setButtons(next);
  }
  function removeBtn(rowIdx: number, btnIdx: number) {
    const next = buttons
      .map((r, i) => (i === rowIdx ? r.filter((_, j) => j !== btnIdx) : r))
      .filter((r) => r.length > 0);
    setButtons(next);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <Field label="Текст сообщения">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder="Что разослать"
            maxLength={4096}
            className={inputCls}
          />
          <div className="flex items-center justify-between mt-1">
            <label className="flex items-center gap-2 text-xs text-neutral-400">
              <input
                type="checkbox"
                checked={parseMode === "markdown_v2"}
                onChange={(e) =>
                  setParseMode(e.target.checked ? "markdown_v2" : null)
                }
                className="accent-white"
              />
              MarkdownV2-разметка
            </label>
            <span className="text-xs text-neutral-500 tabular-nums">
              {text.length} / 4096
            </span>
          </div>
        </Field>

        <Field label="Медиа (опц.)">
          {media ? (
            <div className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 flex items-center justify-between">
              <div className="text-xs">
                <div className="text-neutral-200">
                  {mediaTypeLabel(media.type)} {media.fileName ?? ""}
                </div>
                <div className="text-neutral-500 font-mono mt-0.5 truncate max-w-[40ch]">
                  {media.fileId}
                </div>
              </div>
              <button
                type="button"
                onClick={onClearMedia}
                className="text-xs text-neutral-400 hover:text-rose-300"
              >
                убрать
              </button>
            </div>
          ) : (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                onChange={onFileChange}
                accept="image/*,video/*,application/*,.pdf,.zip,.doc,.docx"
                disabled={mediaUploading}
                className="block w-full text-xs text-neutral-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-neutral-800 file:text-neutral-200 file:hover:bg-neutral-700 file:cursor-pointer"
              />
              <p className="text-xs text-neutral-500 mt-1">
                Файл загрузится через бота в твой stash-чат, обратно вернётся
                file_id — он и сохранится в рассылке.
              </p>
              {mediaUploading ? (
                <p className="text-xs text-amber-400 mt-1">загружаю…</p>
              ) : null}
              {mediaError ? (
                <p className="text-xs text-rose-400 mt-1">{mediaError}</p>
              ) : null}
            </div>
          )}
        </Field>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-neutral-500">
              Inline-кнопки (опц.)
            </span>
            <button
              type="button"
              onClick={addRow}
              className="text-xs text-neutral-300 hover:text-white px-2 py-0.5 border border-neutral-700 rounded-md hover:bg-neutral-800/60"
            >
              + строка
            </button>
          </div>
          {buttons.length === 0 ? (
            <p className="text-xs text-neutral-600">
              Без кнопок — пустое место под текстом.
            </p>
          ) : (
            <div className="space-y-2">
              {buttons.map((row, ri) => (
                <div
                  key={ri}
                  className="space-y-1 rounded-md border border-neutral-800 bg-neutral-950 p-2"
                >
                  {row.map((b, bi) => (
                    <div key={bi} className="grid grid-cols-12 gap-1">
                      <input
                        type="text"
                        value={b.text}
                        onChange={(e) =>
                          updateBtn(ri, bi, { text: e.target.value })
                        }
                        placeholder="Текст"
                        className={`${inputCls} col-span-4`}
                      />
                      <input
                        type="url"
                        value={b.url}
                        onChange={(e) =>
                          updateBtn(ri, bi, { url: e.target.value })
                        }
                        placeholder="https://… или tg://…"
                        className={`${inputCls} col-span-7`}
                      />
                      <button
                        type="button"
                        onClick={() => removeBtn(ri, bi)}
                        className="col-span-1 text-xs text-neutral-500 hover:text-rose-300"
                        title="удалить кнопку"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addBtn(ri)}
                    className="text-xs text-neutral-400 hover:text-white"
                  >
                    + кнопка в эту строку
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <div className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
          Превью
        </div>
        <Preview text={text} media={media} buttons={buttons} />
      </div>
    </div>
  );
}

function Step3({
  title,
  audience,
  audienceCount,
  text,
  parseMode,
  media,
  buttons,
  mode,
  setMode,
  scheduledLocal,
  setScheduledLocal,
}: {
  title: string;
  audience: AudienceType;
  audienceCount: number;
  text: string;
  parseMode: "markdown_v2" | null;
  media: MediaState | null;
  buttons: BroadcastButton[][];
  mode: Mode;
  setMode: (m: Mode) => void;
  scheduledLocal: string;
  setScheduledLocal: (s: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <fieldset className="space-y-2">
          <legend className="text-xs uppercase tracking-wide text-neutral-500 mb-1">
            Когда отправить
          </legend>
          <label
            className={`flex items-start gap-3 rounded-md border px-3 py-2 cursor-pointer ${
              mode === "now"
                ? "border-white bg-neutral-800/60"
                : "border-neutral-800 hover:bg-neutral-800/40"
            }`}
          >
            <input
              type="radio"
              checked={mode === "now"}
              onChange={() => setMode("now")}
              className="mt-1 accent-white"
            />
            <span>
              <span className="block text-sm text-neutral-100">
                Отправить сейчас
              </span>
              <span className="block text-xs text-neutral-500 mt-0.5">
                Воркер бота возьмёт в работу сразу после создания
              </span>
            </span>
          </label>
          <label
            className={`flex items-start gap-3 rounded-md border px-3 py-2 cursor-pointer ${
              mode === "scheduled"
                ? "border-white bg-neutral-800/60"
                : "border-neutral-800 hover:bg-neutral-800/40"
            }`}
          >
            <input
              type="radio"
              checked={mode === "scheduled"}
              onChange={() => setMode("scheduled")}
              className="mt-1 accent-white"
            />
            <span className="flex-1">
              <span className="block text-sm text-neutral-100">
                Запланировать на …
              </span>
              <input
                type="datetime-local"
                value={scheduledLocal}
                onChange={(e) => setScheduledLocal(e.target.value)}
                onClick={() => setMode("scheduled")}
                className={`${inputCls} mt-2`}
              />
            </span>
          </label>
        </fieldset>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 space-y-3">
        <div className="text-xs uppercase tracking-wide text-neutral-500">
          Сводка
        </div>
        <SummaryRow label="Заголовок" value={title || "—"} />
        <SummaryRow
          label="Аудитория"
          value={`${audienceLabel(audience)} · ${audienceCount} получателей`}
        />
        <SummaryRow
          label="Текст"
          value={
            text
              ? `${text.length} симв.${parseMode === "markdown_v2" ? " · MarkdownV2" : ""}`
              : "—"
          }
        />
        <SummaryRow
          label="Медиа"
          value={media ? mediaTypeLabel(media.type) : "—"}
        />
        <SummaryRow
          label="Кнопки"
          value={
            buttons.length
              ? `${buttons.length} строк, ${buttons.reduce((acc, r) => acc + r.length, 0)} кнопок`
              : "—"
          }
        />
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3 text-sm border-b border-neutral-800/60 pb-2 last:border-0 last:pb-0">
      <div className="w-32 text-xs text-neutral-500 uppercase tracking-wide">
        {label}
      </div>
      <div className="flex-1 text-neutral-200">{value}</div>
    </div>
  );
}

function Preview({
  text,
  media,
  buttons,
}: {
  text: string;
  media: MediaState | null;
  buttons: BroadcastButton[][];
}) {
  return (
    <div className="rounded-2xl rounded-tl-sm bg-sky-900/50 border border-sky-700/40 px-3 py-2 max-w-md">
      {media ? (
        <div className="aspect-video rounded-md bg-neutral-800/80 border border-neutral-700 flex items-center justify-center text-neutral-400 text-xs mb-2">
          [{mediaTypeLabel(media.type)}]
        </div>
      ) : null}
      <div className="text-sm whitespace-pre-wrap break-words text-neutral-100 min-h-[1em]">
        {text || (
          <span className="text-neutral-500">— текст пуст —</span>
        )}
      </div>
      {buttons.length > 0 ? (
        <div className="space-y-1 mt-2">
          {buttons.map((row, ri) => (
            <div key={ri} className="flex gap-1">
              {row.map((b, bi) => (
                <div
                  key={bi}
                  className="flex-1 rounded-md bg-sky-800/60 border border-sky-600/50 px-2 py-1 text-xs text-center text-neutral-100 truncate"
                  title={b.url}
                >
                  {b.text || "(пустая кнопка)"}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1 block">
      <span className="text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function audienceLabel(a: AudienceType): string {
  return a === "all"
    ? "все пользователи бота"
    : a === "connected"
      ? "владельцы business-подключений"
      : "ручной список user_id";
}

function mediaTypeLabel(t: MediaType): string {
  return t === "photo" ? "📷 фото" : t === "video" ? "🎬 видео" : "📎 файл";
}

function mediaTypeForFile(f: File): MediaType {
  if (f.type.startsWith("image/")) return "photo";
  if (f.type.startsWith("video/")) return "video";
  return "document";
}

function parseManualIds(raw: string): number[] {
  const seen = new Set<number>();
  for (const tok of raw.split(/[\s,;]+/)) {
    const n = Number(tok.trim());
    if (Number.isFinite(n) && n > 0) seen.add(n);
  }
  return Array.from(seen);
}
