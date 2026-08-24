ALTER TABLE "invoice_items"
ADD COLUMN "line_position" INTEGER;

WITH positioned_items AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "invoice_id"
      ORDER BY "created_at" ASC, "id" ASC
    )::INTEGER AS "position"
  FROM "invoice_items"
)
UPDATE "invoice_items" AS "item"
SET "line_position" = "positioned_items"."position"
FROM "positioned_items"
WHERE "item"."id" = "positioned_items"."id";

ALTER TABLE "invoice_items"
ALTER COLUMN "line_position" SET NOT NULL;

ALTER TABLE "invoice_items"
ADD CONSTRAINT "invoice_items_line_position_check"
CHECK ("line_position" > 0);

CREATE UNIQUE INDEX "invoice_items_invoice_id_line_position_key"
ON "invoice_items"("invoice_id", "line_position");
