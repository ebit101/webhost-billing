-- Organizational only: existing products remain ungrouped; no prices or history change.
CREATE TABLE "product_groups" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "product_groups_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_groups_display_order_check" CHECK ("display_order" BETWEEN 0 AND 10000)
);
CREATE UNIQUE INDEX "product_groups_name_key" ON "product_groups"("name");
CREATE INDEX "product_groups_order_idx" ON "product_groups"("display_order", "name");
ALTER TABLE "products" ADD COLUMN "group_id" UUID;
CREATE INDEX "products_group_order_idx" ON "products"("group_id", "display_order");
ALTER TABLE "products" ADD CONSTRAINT "products_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "product_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
