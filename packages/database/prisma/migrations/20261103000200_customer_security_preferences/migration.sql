CREATE TABLE "customer_security_preferences" (
    "user_id" UUID NOT NULL,
    "email_two_step" BOOLEAN NOT NULL DEFAULT false,
    "marketing_consent" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "customer_security_preferences_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "customer_security_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "customer_email_challenges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "credential_binding" CHAR(64) NOT NULL,
    "delivery_ciphertext" TEXT NOT NULL,
    "ip_address_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "customer_email_challenges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_email_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "customer_email_challenges_token_hash_key" ON "customer_email_challenges"("token_hash");
CREATE INDEX "customer_email_challenges_user_id_used_at_expires_at_idx" ON "customer_email_challenges"("user_id", "used_at", "expires_at");
