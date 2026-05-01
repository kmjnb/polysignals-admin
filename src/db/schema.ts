import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const businessConnections = pgTable("business_connections", {
  id: text("business_connection_id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  canReply: boolean("can_reply").notNull().default(false),
  username: text("username"),
  fullName: text("full_name"),
  consentedAt: timestamp("consented_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable(
  "messages",
  {
    businessConnectionId: text("business_connection_id").notNull(),
    chatId: bigint("chat_id", { mode: "number" }).notNull(),
    messageId: bigint("message_id", { mode: "number" }).notNull(),
    chatLabel: text("chat_label"),
    fromId: bigint("from_id", { mode: "number" }),
    fromName: text("from_name"),
    text: text("text"),
    mediaType: text("media_type"),
    fileId: text("file_id"),
    localPath: text("local_path"),
    width: integer("width"),
    height: integer("height"),
    duration: integer("duration"),
    isSelfDestruct: boolean("is_self_destruct").notNull().default(false),
    capturedViaReply: boolean("captured_via_reply").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    editHistory: jsonb("edit_history"),
  },
  (t) => [
    primaryKey({ columns: [t.businessConnectionId, t.chatId, t.messageId] }),
    index("messages_owner_created_idx").on(t.businessConnectionId, t.createdAt),
    index("messages_chat_idx").on(t.businessConnectionId, t.chatId, t.createdAt),
    index("messages_deleted_idx").on(t.deletedAt),
  ],
);

// People who interacted with the bot — keyed by Telegram user_id.
export const botUsers = pgTable("bot_users", {
  userId: bigint("user_id", { mode: "number" }).primaryKey(),
  username: text("username"),
  fullName: text("full_name"),
  languageCode: text("language_code"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  isBlocked: boolean("is_blocked").notNull().default(false),
});

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  starsAmount: integer("stars_amount").notNull(),
  telegramChargeId: text("telegram_charge_id"),
  status: text("status").notNull().default("active"), // active | refunded | expired
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

// Plan = price + duration. One row = one tariff.
export const subscriptionPlans = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  starsPrice: integer("stars_price").notNull(),
  durationDays: integer("duration_days"), // null = lifetime
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Channels users must subscribe to before bot activates.
export const channelGates = pgTable("channel_gates", {
  id: serial("id").primaryKey(),
  channelId: bigint("channel_id", { mode: "number" }).notNull().unique(),
  channelUsername: text("channel_username"),
  inviteLink: text("invite_link"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const broadcasts = pgTable("broadcasts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  audience: text("audience").notNull(), // all | connected | manual
  audienceUserIds: jsonb("audience_user_ids"), // for "manual"
  payload: jsonb("payload").notNull(), // { text, media: {...}, buttons: [...] }
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  totalRecipients: integer("total_recipients").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  status: text("status").notNull().default("draft"), // draft | scheduled | running | done | cancelled
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const broadcastRecipients = pgTable(
  "broadcast_recipients",
  {
    broadcastId: integer("broadcast_id").notNull(),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    status: text("status").notNull().default("pending"), // pending | sent | failed | skipped
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.broadcastId, t.userId] })],
);

// Single-admin model: admin Telegram user_ids whitelist.
export const adminUsers = pgTable("admin_users", {
  userId: bigint("user_id", { mode: "number" }).primaryKey(),
  username: text("username"),
  fullName: text("full_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  adminUserId: bigint("admin_user_id", { mode: "number" }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
