CREATE TABLE "admin_users" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"username" text,
	"full_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_users" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"username" text,
	"full_name" text,
	"language_code" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_blocked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broadcast_recipients" (
	"broadcast_id" integer NOT NULL,
	"user_id" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"sent_at" timestamp with time zone,
	CONSTRAINT "broadcast_recipients_broadcast_id_user_id_pk" PRIMARY KEY("broadcast_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "broadcasts" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"audience" text NOT NULL,
	"audience_user_ids" jsonb,
	"payload" jsonb NOT NULL,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"total_recipients" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_connections" (
	"business_connection_id" text PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"can_reply" boolean DEFAULT false NOT NULL,
	"username" text,
	"full_name" text,
	"consented_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_gates" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" bigint NOT NULL,
	"channel_username" text,
	"invite_link" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_gates_channel_id_unique" UNIQUE("channel_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"business_connection_id" text NOT NULL,
	"chat_id" bigint NOT NULL,
	"message_id" bigint NOT NULL,
	"chat_label" text,
	"from_id" bigint,
	"from_name" text,
	"text" text,
	"media_type" text,
	"file_id" text,
	"local_path" text,
	"width" integer,
	"height" integer,
	"duration" integer,
	"is_self_destruct" boolean DEFAULT false NOT NULL,
	"captured_via_reply" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"edit_history" jsonb,
	CONSTRAINT "messages_business_connection_id_chat_id_message_id_pk" PRIMARY KEY("business_connection_id","chat_id","message_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_user_id" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"stars_price" integer NOT NULL,
	"duration_days" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"stars_amount" integer NOT NULL,
	"telegram_charge_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "messages_owner_created_idx" ON "messages" USING btree ("business_connection_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_chat_idx" ON "messages" USING btree ("business_connection_id","chat_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_deleted_idx" ON "messages" USING btree ("deleted_at");