-- Preserve existing files with orphaned local owner IDs before enforcing the FK.
UPDATE "projects" SET "owner_id" = 'openrive-legacy-unassigned' WHERE "owner_id" = '';--> statement-breakpoint
INSERT INTO "users" ("id", "name", "color")
SELECT DISTINCT p."owner_id", p."owner_id", '#6b7280'
FROM "projects" p
LEFT JOIN "users" u ON u."id" = p."owner_id"
WHERE u."id" IS NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_owner_id_idx" ON "projects" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "projects_organization_id_idx" ON "projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "projects_updated_at_idx" ON "projects" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");
