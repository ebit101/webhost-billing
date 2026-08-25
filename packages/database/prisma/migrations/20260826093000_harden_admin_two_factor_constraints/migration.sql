ALTER TABLE "auth_sessions"
ADD CONSTRAINT "auth_sessions_two_factor_time_check"
CHECK (
  "two_factor_verified_at" IS NULL
  OR (
    "two_factor_verified_at" >= "created_at"
    AND "two_factor_verified_at" <= "expires_at"
  )
);

ALTER TABLE "admin_totp_credentials"
ADD CONSTRAINT "admin_totp_credentials_state_check"
CHECK (
  ("enabled_at" IS NULL OR "enabled_at" >= "created_at")
  AND ("last_used_time_step" IS NULL OR "last_used_time_step" >= 0)
);

ALTER TABLE "admin_recovery_codes"
ADD CONSTRAINT "admin_recovery_codes_hash_format_check"
CHECK ("code_hash" ~ '^[0-9a-f]{64}$'),
ADD CONSTRAINT "admin_recovery_codes_time_order_check"
CHECK ("used_at" IS NULL OR "used_at" >= "created_at");

ALTER TABLE "admin_login_challenges"
ADD CONSTRAINT "admin_login_challenges_hash_format_check"
CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
ADD CONSTRAINT "admin_login_challenges_time_order_check"
CHECK (
  "expires_at" > "created_at"
  AND ("used_at" IS NULL OR "used_at" >= "created_at")
);
