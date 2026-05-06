import { asc, eq } from "drizzle-orm";
import Script from "next/script";

import { db, schema } from "@/db";
import { MiniAppClient } from "./client";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "polysignals — тарифы",
};

export default async function MiniAppPage() {
  const plans = await db
    .select({
      id: schema.subscriptionPlans.id,
      name: schema.subscriptionPlans.name,
      starsPrice: schema.subscriptionPlans.starsPrice,
      durationDays: schema.subscriptionPlans.durationDays,
    })
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.isActive, true))
    .orderBy(asc(schema.subscriptionPlans.starsPrice));

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
      />
      <MiniAppClient plans={plans} />
    </>
  );
}
