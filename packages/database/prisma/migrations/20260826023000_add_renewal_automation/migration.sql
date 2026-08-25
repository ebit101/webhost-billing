-- Link an automated suspension to the unpaid renewal invoice that caused it.
ALTER TABLE "services"
ADD COLUMN "suspension_invoice_id" UUID;

ALTER TABLE "services"
ADD CONSTRAINT "services_suspension_invoice_id_fkey"
FOREIGN KEY ("suspension_invoice_id") REFERENCES "invoices"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "services_suspension_invoice_id_idx"
ON "services"("suspension_invoice_id");

-- One service period can be billed only once. The partial predicate leaves
-- historical/manual lines without complete service periods unchanged.
CREATE UNIQUE INDEX "invoice_items_service_period_key"
ON "invoice_items"("service_id", "service_period_start", "service_period_end")
WHERE "service_id" IS NOT NULL
  AND "service_period_start" IS NOT NULL
  AND "service_period_end" IS NOT NULL;

-- Automated panel operations have no human requester and retain the cycle
-- that requested them. Manual operations continue to require a requester.
ALTER TABLE "hosting_panel_operations"
ALTER COLUMN "requested_by_user_id" DROP NOT NULL,
ADD COLUMN "automation_run_id" UUID;

ALTER TABLE "hosting_panel_operations"
ADD CONSTRAINT "hosting_panel_operations_automation_run_id_fkey"
FOREIGN KEY ("automation_run_id") REFERENCES "automation_runs"("id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "hosting_panel_operations_requester_check"
CHECK (
  ("requested_by_user_id" IS NOT NULL AND "automation_run_id" IS NULL)
  OR ("requested_by_user_id" IS NULL AND "automation_run_id" IS NOT NULL)
);

CREATE INDEX "hosting_panel_operations_automation_run_id_idx"
ON "hosting_panel_operations"("automation_run_id");
