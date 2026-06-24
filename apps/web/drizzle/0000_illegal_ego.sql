CREATE TABLE "health" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "health" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "health_authenticated_read" ON "health" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);