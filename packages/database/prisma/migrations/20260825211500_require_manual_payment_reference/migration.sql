ALTER TABLE "payments"
DROP CONSTRAINT "payments_manual_review_state_check";

ALTER TABLE "payments"
ADD CONSTRAINT "payments_manual_review_state_check"
CHECK (
  "provider" <> 'manual'
  OR (
    "manual_method" IS NOT NULL
    AND "reference" IS NOT NULL
    AND "proof_metadata" IS NOT NULL
    AND (
      ("status" = 'PENDING' AND "reviewed_at" IS NULL AND "verified_at" IS NULL)
      OR ("status" = 'SUCCEEDED' AND "reviewed_at" IS NOT NULL AND "verified_at" IS NOT NULL)
      OR ("status" IN ('FAILED', 'CANCELLED') AND "reviewed_at" IS NOT NULL AND "verified_at" IS NULL)
    )
  )
);
