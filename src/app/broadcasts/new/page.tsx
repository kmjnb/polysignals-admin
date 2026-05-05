import { count, countDistinct, eq } from "drizzle-orm";

import { AdminShell } from "@/components/admin-shell";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/admin-guard";

import { Wizard } from "./wizard";

export const dynamic = "force-dynamic";

export default async function NewBroadcastPage() {
  const session = await requireAdmin();

  const [allRow, connRow] = await Promise.all([
    db
      .select({ n: count() })
      .from(schema.botUsers)
      .where(eq(schema.botUsers.isBlocked, false)),
    db
      .select({ n: countDistinct(schema.businessConnections.userId) })
      .from(schema.businessConnections)
      .where(eq(schema.businessConnections.isEnabled, true)),
  ]);

  return (
    <AdminShell session={session}>
      <Wizard
        counts={{
          all: allRow[0]?.n ?? 0,
          connected: connRow[0]?.n ?? 0,
        }}
      />
    </AdminShell>
  );
}
