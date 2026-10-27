-- CreateTable
CREATE TABLE "notification_epochs" (
    "id" VARCHAR(16) NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_epochs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_sources" (
    "key" VARCHAR(191) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_sources_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT true,
    "phone_ciphertext" TEXT,
    "phone_last_four" VARCHAR(4),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "notification_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "source_key" VARCHAR(191) NOT NULL,
    "channel" VARCHAR(16) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'DISABLED',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "failure_code" VARCHAR(64),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "notification_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_created_idx" ON "notification_entries"("user_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "notifications_status_created_idx" ON "notification_entries"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_source_recipient_key" ON "notification_entries"("source_key", "user_id", "key", "channel");

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_entries" ADD CONSTRAINT "notification_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Begin notification capture at migration time; never resend historical events.
INSERT INTO notification_epochs (id) VALUES ('main');
