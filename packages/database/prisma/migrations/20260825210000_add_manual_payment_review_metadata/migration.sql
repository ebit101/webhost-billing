ALTER TABLE "payments"
ADD COLUMN "reviewed_by_user_id" UUID,
ADD COLUMN "manual_method" VARCHAR(40),
ADD COLUMN "proof_metadata" JSONB,
ADD COLUMN "reviewed_at" TIMESTAMPTZ(3);

UPDATE "payments"
SET
  "manual_method" = 'OTHER',
  "proof_metadata" = '{}'::JSONB,
  "reviewed_at" = CASE
    WHEN "status" <> 'PENDING' THEN COALESCE("verified_at", "updated_at")
    ELSE NULL
  END,
  "reviewed_by_user_id" = CASE
    WHEN "status" <> 'PENDING' THEN "created_by_user_id"
    ELSE NULL
  END
WHERE "provider" = 'manual';

ALTER TABLE "payments"
ADD CONSTRAINT "payments_proof_metadata_object_check"
CHECK ("proof_metadata" IS NULL OR JSONB_TYPEOF("proof_metadata") = 'object'),
ADD CONSTRAINT "payments_manual_method_check"
CHECK ("manual_method" IS NULL OR "manual_method" ~ '^[A-Z][A-Z_]{0,39}$'),
ADD CONSTRAINT "payments_manual_review_state_check"
CHECK (
  "provider" <> 'manual'
  OR (
    "manual_method" IS NOT NULL
    AND "proof_metadata" IS NOT NULL
    AND (
      ("status" = 'PENDING' AND "reviewed_at" IS NULL AND "verified_at" IS NULL)
      OR ("status" = 'SUCCEEDED' AND "reviewed_at" IS NOT NULL AND "verified_at" IS NOT NULL)
      OR ("status" IN ('FAILED', 'CANCELLED') AND "reviewed_at" IS NOT NULL AND "verified_at" IS NULL)
    )
  )
);

CREATE INDEX "payments_reviewed_by_user_id_idx"
ON "payments"("reviewed_by_user_id");

ALTER TABLE "payments"
ADD CONSTRAINT "payments_reviewed_by_user_id_fkey"
FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
