export function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

export const MEDIA_LABEL: Record<string, string> = {
  photo: "📷 фото",
  video: "🎬 видео",
  video_note: "⚪ кружок",
  voice: "🎙 голосовое",
  audio: "🎵 аудио",
  animation: "🎞 gif",
  sticker: "💟 стикер",
  document: "📎 документ",
};

export function mediaLabel(mediaType: string | null | undefined): string {
  if (!mediaType) return "";
  return MEDIA_LABEL[mediaType] ?? `📎 ${mediaType}`;
}

export function truncate(text: string, max = 120): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}
