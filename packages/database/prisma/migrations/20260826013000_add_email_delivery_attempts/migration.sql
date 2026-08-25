-- CreateEnum
CREATE TYPE "EmailAttemptStatus" AS ENUM ('STARTED', 'SENT', 'FAILED', 'INCONSISTENT');

-- AlterTable
ALTER TABLE "email_logs"
ADD COLUMN "outbox_event_id" UUID,
ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "email_logs" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "email_attempts" (
    "id" UUID NOT NULL,
    "email_log_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" "EmailAttemptStatus" NOT NULL DEFAULT 'STARTED',
    "provider" VARCHAR(64) NOT NULL,
    "provider_message_id" VARCHAR(191),
    "failure_kind" VARCHAR(20),
    "failure_code" VARCHAR(80),
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "email_attempts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "email_attempts_number_check" CHECK ("attempt_number" > 0),
    CONSTRAINT "email_attempts_failure_kind_check" CHECK (
        "failure_kind" IS NULL OR "failure_kind" IN ('TEMPORARY', 'PERMANENT', 'INCONSISTENT')
    ),
    CONSTRAINT "email_attempts_state_check" CHECK (
        ("status" = 'STARTED' AND "completed_at" IS NULL AND "provider_message_id" IS NULL AND "failure_kind" IS NULL AND "failure_code" IS NULL)
        OR
        ("status" = 'SENT' AND "completed_at" IS NOT NULL AND "provider_message_id" IS NOT NULL AND "failure_kind" IS NULL AND "failure_code" IS NULL)
        OR
        ("status" = 'FAILED' AND "completed_at" IS NOT NULL AND "provider_message_id" IS NULL AND "failure_kind" IN ('TEMPORARY', 'PERMANENT') AND "failure_code" IS NOT NULL)
        OR
        ("status" = 'INCONSISTENT' AND "completed_at" IS NOT NULL AND "provider_message_id" IS NULL AND "failure_kind" = 'INCONSISTENT' AND "failure_code" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "email_logs_outbox_event_id_key" ON "email_logs"("outbox_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_attempts_log_attempt_key" ON "email_attempts"("email_log_id", "attempt_number");

-- CreateIndex
CREATE INDEX "email_attempts_status_started_at_idx" ON "email_attempts"("status", "started_at");

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_outbox_event_id_fkey" FOREIGN KEY ("outbox_event_id") REFERENCES "outbox_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_attempts" ADD CONSTRAINT "email_attempts_email_log_id_fkey" FOREIGN KEY ("email_log_id") REFERENCES "email_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
