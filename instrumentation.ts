import { type Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  // Use the bizlogger/broadcast bot — admin has /start'd it. The admin
  // login bot exists only for OAuth and may not have a DM session open.
  const token = process.env.BROADCAST_BOT_TOKEN || process.env.BOT_TOKEN;
  const adminChatId = process.env.ADMIN_CHAT_ID;
  if (!token || !adminChatId) {
    console.error("[onRequestError]", err, request, context);
    return;
  }
  const e = err as Error & { digest?: string };
  const text = [
    `🚨 <b>admin error</b>`,
    `<code>${escape(e.message ?? String(err))}</code>`,
    `<i>${escape(request.method)} ${escape(request.path)}</i>`,
    `route: ${escape(context.routePath ?? "?")} (${context.routeType})`,
    e.digest ? `digest: <code>${escape(e.digest)}</code>` : null,
    e.stack ? `<pre>${escape(e.stack.slice(0, 1500))}</pre>` : null,
  ]
    .filter(Boolean)
    .join("\n");
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: adminChatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
  } catch (reportError) {
    console.error("[onRequestError] report failed", reportError);
  }
};

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
