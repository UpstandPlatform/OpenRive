CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_id" text DEFAULT '' NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"thumbnail" text,
	"artboards" integer,
	"animations" integer,
	"state_machines" integer,
	"shared_with" jsonb,
	"doc" text,
	"riv" "bytea"
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"role" text DEFAULT 'editor' NOT NULL,
	"created_at" bigint NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
