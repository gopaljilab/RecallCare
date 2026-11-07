CREATE TABLE "agent_outcomes" (
	"id" serial PRIMARY KEY NOT NULL,
	"assessment_id" integer NOT NULL,
	"clinician_id" uuid,
	"patient_id" text,
	"helpful" boolean NOT NULL,
	"intervention" text,
	"outcome_text" text NOT NULL,
	"hindsight_memory_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_email_verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_user_id" uuid NOT NULL,
	"verification_code" varchar(6) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false,
	"attempt_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "prediction_method" text;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "model_version" text;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "fallback_used" boolean;--> statement-breakpoint
ALTER TABLE "agent_outcomes" ADD CONSTRAINT "agent_outcomes_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_outcomes" ADD CONSTRAINT "agent_outcomes_clinician_id_users_id_fk" FOREIGN KEY ("clinician_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_email_verification_tokens" ADD CONSTRAINT "patient_email_verification_tokens_patient_user_id_patient_users_id_fk" FOREIGN KEY ("patient_user_id") REFERENCES "public"."patient_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_outcomes_assessment_id_idx" ON "agent_outcomes" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "agent_outcomes_patient_id_idx" ON "agent_outcomes" USING btree ("patient_id");