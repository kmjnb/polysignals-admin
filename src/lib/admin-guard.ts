import { redirect } from "next/navigation";

import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { readSession, type SessionPayload } from "./session";
import { env } from "./env";

export async function isAdmin(userId: number): Promise<boolean> {
  if (env.PRIMARY_ADMIN_USER_ID && userId === env.PRIMARY_ADMIN_USER_ID) return true;
  const rows = await db
    .select({ userId: schema.adminUsers.userId })
    .from(schema.adminUsers)
    .where(eq(schema.adminUsers.userId, userId))
    .limit(1);
  return rows.length > 0;
}

export async function requireAdmin(): Promise<SessionPayload> {
  const session = await readSession();
  if (!session) redirect("/login");
  if (!(await isAdmin(session.uid))) redirect("/login?error=not_admin");
  return session;
}
