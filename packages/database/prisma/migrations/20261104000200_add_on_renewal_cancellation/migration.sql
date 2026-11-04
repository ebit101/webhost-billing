ALTER TABLE "order_items"
  ADD COLUMN "renewal_ends_at" TIMESTAMPTZ(3),
  ADD CONSTRAINT "order_items_renewal_ends_at_check" CHECK (
    "renewal_ends_at" IS NULL OR (
      "kind" = 'ADD_ON'
      AND "billing_period" IN ('MONTHLY', 'QUARTERLY', 'ANNUAL')
      AND "fulfilled_at" IS NOT NULL
    )
  );
