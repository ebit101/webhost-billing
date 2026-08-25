ALTER TABLE "auth_sessions"
ADD COLUMN "two_factor_verified_at" TIMESTAMPTZ(3);

CREATE TABLE "admin_totp_credentials" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "secret_ciphertext" TEXT NOT NULL,
    "key_version" VARCHAR(64) NOT NULL,
    "enabled_at" TIMESTAMPTZ(3),
    "last_used_time_step" BIGINT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "admin_totp_credentials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_recovery_codes" (
    "id" UUID NOT NULL,
    "credential_id" UUID NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_recovery_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_login_challenges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "ip_address_hash" CHAR(64) NOT NULL,
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_login_challenges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_totp_credentials_user_id_key"
ON "admin_totp_credentials"("user_id");

CREATE INDEX "admin_totp_credentials_enabled_at_idx"
ON "admin_totp_credentials"("enabled_at");

CREATE UNIQUE INDEX "admin_recovery_codes_hash_key"
ON "admin_recovery_codes"("code_hash");

CREATE INDEX "admin_recovery_codes_credential_used_idx"
ON "admin_recovery_codes"("credential_id", "used_at");

CREATE UNIQUE INDEX "admin_login_challenges_token_hash_key"
ON "admin_login_challenges"("token_hash");

CREATE INDEX "admin_login_challenges_user_active_idx"
ON "admin_login_challenges"("user_id", "used_at", "expires_at");

CREATE INDEX "admin_login_challenges_expires_at_idx"
ON "admin_login_challenges"("expires_at");

ALTER TABLE "admin_totp_credentials"
ADD CONSTRAINT "admin_totp_credentials_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "admin_recovery_codes"
ADD CONSTRAINT "admin_recovery_codes_credential_id_fkey"
FOREIGN KEY ("credential_id") REFERENCES "admin_totp_credentials"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "admin_login_challenges"
ADD CONSTRAINT "admin_login_challenges_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "admin_login_challenges"
ADD CONSTRAINT "admin_login_challenges_failed_attempts_check"
CHECK ("failed_attempts" >= 0 AND "failed_attempts" <= 5);
