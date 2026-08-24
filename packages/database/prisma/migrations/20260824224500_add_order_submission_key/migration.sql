ALTER TABLE "orders"
  ADD COLUMN "submission_key" VARCHAR(191);

UPDATE "orders"
SET "submission_key" = 'legacy:' || "id"::text
WHERE "submission_key" IS NULL;

ALTER TABLE "orders"
  ALTER COLUMN "submission_key" SET NOT NULL;

CREATE UNIQUE INDEX "orders_submission_key_key"
  ON "orders"("submission_key");
