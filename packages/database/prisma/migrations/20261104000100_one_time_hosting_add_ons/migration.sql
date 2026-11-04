ALTER TYPE "ProductKind" ADD VALUE 'ADD_ON';

ALTER TABLE "order_items" ADD COLUMN "fulfilled_at" TIMESTAMPTZ(3);

CREATE TABLE "product_add_on_eligibility" (
    "hosting_product_id" UUID NOT NULL,
    "add_on_product_id" UUID NOT NULL,
    CONSTRAINT "product_add_on_eligibility_pkey" PRIMARY KEY ("hosting_product_id", "add_on_product_id"),
    CONSTRAINT "product_add_on_eligibility_hosting_product_id_fkey" FOREIGN KEY ("hosting_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "product_add_on_eligibility_add_on_product_id_fkey" FOREIGN KEY ("add_on_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "product_add_on_eligibility_add_on_product_id_idx" ON "product_add_on_eligibility"("add_on_product_id");
