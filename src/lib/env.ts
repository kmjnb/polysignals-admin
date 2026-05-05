function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export const env = {
  BOT_TOKEN: process.env.BOT_TOKEN ?? "",
  BOT_PROXY_URL: process.env.BOT_PROXY_URL ?? "",
  TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME ?? "",
  AUTH_SECRET: process.env.AUTH_SECRET ?? "",
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  PRIMARY_ADMIN_USER_ID: Number(process.env.PRIMARY_ADMIN_USER_ID ?? 0),
  required,
};
