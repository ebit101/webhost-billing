ALTER TABLE "invoices"
  ADD COLUMN "submission_key" VARCHAR(191),
  ADD COLUMN "credit_total" BIGINT NOT NULL DEFAULT 0;

UPDATE "invoices"
SET "submission_key" = 'legacy:' || "id"::text
WHERE "submission_key" IS NULL;

ALTER TABLE "invoices"
  ALTER COLUMN "submission_key" SET NOT NULL,
  DROP CONSTRAINT "invoices_amounts_check",
  DROP CONSTRAINT "invoices_balance_check";

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_amounts_check"
    CHECK (
      "subtotal" >= 0 AND
      "discount_total" >= 0 AND
      "tax_total" >= 0 AND
      "total" >= 0 AND
      "credit_total" >= 0 AND
      "amount_paid" >= 0 AND
      "balance_due" >= 0
    ),
  ADD CONSTRAINT "invoices_settlement_limit_check"
    CHECK ("credit_total" + "amount_paid" <= "total"),
  ADD CONSTRAINT "invoices_balance_check"
    CHECK ("balance_due" = "total" - "credit_total" - "amount_paid");

CREATE UNIQUE INDEX "invoices_submission_key_key"
  ON "invoices"("submission_key");
