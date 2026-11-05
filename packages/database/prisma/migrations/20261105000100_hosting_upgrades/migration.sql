-- Keep the original purchase/provisioning snapshot immutable.
ALTER TABLE "services" ADD COLUMN "current_package_identifier" VARCHAR(191);
ALTER TABLE "services" ADD CONSTRAINT "services_current_package_check"
  CHECK ("current_package_identifier" IS NULL OR length(trim("current_package_identifier")) > 0);
CREATE TABLE "service_upgrades" (
  "id" UUID NOT NULL,
  "service_id" UUID NOT NULL,
  "invoice_id" UUID,
  "operation_id" UUID,
  "status" VARCHAR(24) NOT NULL DEFAULT 'QUOTED',
  "quote" JSONB NOT NULL,
  "context_hash" CHAR(64) NOT NULL,
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "accepted_at" TIMESTAMPTZ(3),
  "approved_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "error" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "service_upgrades_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_upgrades_state_check" CHECK (
    "status" IN ('QUOTED', 'REQUESTED', 'APPLYING', 'REVIEW_REQUIRED', 'COMPLETED', 'CANCELLED')
    AND "attempt" BETWEEN 0 AND 2
    AND jsonb_typeof("quote") = 'object'
    AND "context_hash" ~ '^[0-9a-f]{64}$'
    AND ("status" NOT IN ('REQUESTED', 'APPLYING', 'COMPLETED') OR ("invoice_id" IS NOT NULL AND "accepted_at" IS NOT NULL))
    AND ("status" <> 'COMPLETED' OR ("completed_at" IS NOT NULL AND "approved_at" IS NOT NULL AND "operation_id" IS NOT NULL))
  ),
  CONSTRAINT "service_upgrades_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_upgrades_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_upgrades_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "hosting_panel_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "service_upgrades_invoice_id_key" ON "service_upgrades"("invoice_id");
CREATE UNIQUE INDEX "service_upgrades_operation_id_key" ON "service_upgrades"("operation_id");
CREATE INDEX "service_upgrades_service_created_at_idx" ON "service_upgrades"("service_id", "created_at");
CREATE UNIQUE INDEX "service_upgrades_pending_service_key" ON "service_upgrades"("service_id")
  WHERE "status" IN ('REQUESTED', 'APPLYING', 'REVIEW_REQUIRED');
