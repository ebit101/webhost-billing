ALTER TABLE "products"
  ADD COLUMN "public_visible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "display_order" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "hosting_package_identifier" VARCHAR(191),
  ADD COLUMN "storage_feature" VARCHAR(80),
  ADD COLUMN "website_feature" VARCHAR(80),
  ADD COLUMN "email_feature" VARCHAR(80),
  ADD COLUMN "bandwidth_feature" VARCHAR(80),
  ADD CONSTRAINT "products_display_order_check" CHECK ("display_order" >= 0);

CREATE INDEX "products_public_catalog_idx"
  ON "products"("public_visible", "status", "display_order");
