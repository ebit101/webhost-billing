ALTER TABLE "services"
ADD COLUMN "product_price_id" UUID,
ADD COLUMN "terminated_by_user_id" UUID,
ADD COLUMN "product_name_snapshot" VARCHAR(160),
ADD COLUMN "product_description_snapshot" TEXT,
ADD COLUMN "provisioning_snapshot" JSONB,
ADD COLUMN "started_at" TIMESTAMPTZ(3),
ADD COLUMN "suspension_reason" TEXT,
ADD COLUMN "provisioning_failure_reason" TEXT,
ADD COLUMN "cancelled_at" TIMESTAMPTZ(3),
ADD COLUMN "termination_reason" TEXT;

UPDATE "services" AS s
SET
  "product_price_id" = oi."product_price_id",
  "product_name_snapshot" = oi."product_name_snapshot",
  "product_description_snapshot" = oi."description_snapshot",
  "provisioning_snapshot" = oi."provisioning_snapshot",
  "started_at" = COALESCE(s."activated_at", s."created_at")
FROM "order_items" AS oi
WHERE oi."id" = s."order_item_id";

UPDATE "services" AS s
SET
  "product_price_id" = pp."id",
  "product_name_snapshot" = p."name",
  "product_description_snapshot" = p."description",
  "provisioning_snapshot" = jsonb_build_object(
    'hostingPackageIdentifier',
    p."hosting_package_identifier"
  ),
  "started_at" = COALESCE(s."activated_at", s."created_at")
FROM "products" AS p
JOIN "product_prices" AS pp ON pp."product_id" = p."id"
WHERE s."product_id" = p."id"
  AND s."product_price_id" IS NULL
  AND pp."billing_period" = s."billing_period"
  AND pp."currency" = s."currency"
  AND pp."amount" = s."recurring_amount";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "services"
    WHERE "product_price_id" IS NULL
      OR "product_name_snapshot" IS NULL
      OR "started_at" IS NULL
      OR "server_id" IS NULL
      OR "next_due_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'Existing services cannot be backfilled with required management fields';
  END IF;
END $$;

ALTER TABLE "services"
ALTER COLUMN "product_price_id" SET NOT NULL,
ALTER COLUMN "product_name_snapshot" SET NOT NULL,
ALTER COLUMN "started_at" SET NOT NULL,
ALTER COLUMN "server_id" SET NOT NULL,
ALTER COLUMN "next_due_at" SET NOT NULL;

ALTER TABLE "services"
ADD CONSTRAINT "services_product_price_id_fkey"
FOREIGN KEY ("product_price_id") REFERENCES "product_prices"("id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "services_terminated_by_user_id_fkey"
FOREIGN KEY ("terminated_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "services_due_after_start_check"
CHECK ("next_due_at" > "started_at"),
ADD CONSTRAINT "services_active_identity_check"
CHECK (
  "status" NOT IN ('ACTIVE', 'SUSPENDED', 'TERMINATED')
  OR ("external_account_id" IS NOT NULL AND "control_panel_username" IS NOT NULL)
),
ADD CONSTRAINT "services_suspension_metadata_check"
CHECK (
  "status" <> 'SUSPENDED'
  OR ("suspended_at" IS NOT NULL AND "suspension_reason" IS NOT NULL)
),
ADD CONSTRAINT "services_failure_metadata_check"
CHECK (
  "status" <> 'PROVISION_FAILED'
  OR "provisioning_failure_reason" IS NOT NULL
),
ADD CONSTRAINT "services_cancellation_metadata_check"
CHECK (
  "status" <> 'CANCELLED'
  OR ("cancelled_at" IS NOT NULL AND "cancellation_reason" IS NOT NULL)
),
ADD CONSTRAINT "services_termination_metadata_check"
CHECK (
  "status" <> 'TERMINATED'
  OR (
    "terminated_at" IS NOT NULL
    AND "termination_reason" IS NOT NULL
    AND "terminated_by_user_id" IS NOT NULL
  )
);

CREATE INDEX "services_product_price_id_idx"
ON "services"("product_price_id");

CREATE INDEX "services_terminated_by_user_id_idx"
ON "services"("terminated_by_user_id");
