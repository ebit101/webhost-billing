CREATE TABLE "integration_credentials" (
    "id" UUID NOT NULL,
    "provider_key" VARCHAR(64) NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "key_version" VARCHAR(64) NOT NULL,
    "masked_identifier" VARCHAR(200) NOT NULL,
    "updated_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_credentials_provider_key_key"
ON "integration_credentials"("provider_key");

CREATE INDEX "integration_credentials_updated_by_user_id_idx"
ON "integration_credentials"("updated_by_user_id");

ALTER TABLE "integration_credentials"
ADD CONSTRAINT "integration_credentials_updated_by_user_id_fkey"
FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
