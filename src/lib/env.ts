function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export const env = {
  BOT_TOKEN: process.env.BOT_TOKEN ?? "",
  // Token of the bot that will actually send broadcasts (bizlogger).
  // file_id is bot-scoped, so the admin upload must come from the same bot.
  // Falls back to BOT_TOKEN when not set (single-bot setup).
  BROADCAST_BOT_TOKEN:
    process.env.BROADCAST_BOT_TOKEN || process.env.BOT_TOKEN || "",
  BOT_PROXY_URL: process.env.BOT_PROXY_URL ?? "",
  TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME ?? "",
  AUTH_SECRET: process.env.AUTH_SECRET ?? "",
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  PRIMARY_ADMIN_USER_ID: Number(process.env.PRIMARY_ADMIN_USER_ID ?? 0),
  required,
};
