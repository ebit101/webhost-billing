-- The existing durable plan-change store retains upgrade history unchanged.
BEGIN;
ALTER TABLE "service_upgrades" DROP CONSTRAINT "service_upgrades_state_check";
ALTER TABLE "service_upgrades" ADD CONSTRAINT "service_upgrades_state_check" CHECK (
  "status" IN ('QUOTED', 'REQUESTED', 'SCHEDULED', 'APPLYING', 'REVIEW_REQUIRED', 'COMPLETED', 'CANCELLED')
  AND "attempt" BETWEEN 0 AND 2
  AND jsonb_typeof("quote") = 'object'
  AND ("quote"->>'change' IN ('UPGRADE', 'DOWNGRADE')) IS TRUE
  AND "context_hash" ~ '^[0-9a-f]{64}$'
  AND ("status" <> 'SCHEDULED' OR ("quote"->>'change' = 'DOWNGRADE' AND "accepted_at" IS NOT NULL))
  AND ("status" <> 'REQUESTED' OR "quote"->>'change' = 'UPGRADE')
  AND ("status" NOT IN ('REQUESTED', 'APPLYING', 'COMPLETED') OR
    ("accepted_at" IS NOT NULL AND ("quote"->>'change' = 'DOWNGRADE' OR "invoice_id" IS NOT NULL)))
  AND ("quote"->>'change' <> 'DOWNGRADE' OR
    ("invoice_id" IS NULL AND "quote"->'immediateCharge'->>'amount' = '0')) IS TRUE
  AND ("status" <> 'COMPLETED' OR ("completed_at" IS NOT NULL AND "approved_at" IS NOT NULL AND "operation_id" IS NOT NULL))
);
DROP INDEX "service_upgrades_pending_service_key";
CREATE UNIQUE INDEX "service_upgrades_pending_service_key" ON "service_upgrades"("service_id")
  WHERE "status" IN ('REQUESTED', 'SCHEDULED', 'APPLYING', 'REVIEW_REQUIRED');
COMMIT;
