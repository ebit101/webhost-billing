ALTER TABLE "auth_sessions"
  ADD CONSTRAINT "auth_sessions_token_hash_format_check"
    CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "auth_sessions_time_order_check"
    CHECK (
      "last_seen_at" >= "created_at"
      AND "expires_at" > "created_at"
      AND ("revoked_at" IS NULL OR "revoked_at" >= "created_at")
    );

ALTER TABLE "password_reset_tokens"
  ADD CONSTRAINT "password_reset_tokens_hash_format_check"
    CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "password_reset_tokens_time_order_check"
    CHECK (
      "expires_at" > "created_at"
      AND ("used_at" IS NULL OR "used_at" >= "created_at")
    );

ALTER TABLE "email_verification_tokens"
  ADD CONSTRAINT "email_verification_tokens_hash_format_check"
    CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "email_verification_tokens_time_order_check"
    CHECK (
      "expires_at" > "created_at"
      AND ("used_at" IS NULL OR "used_at" >= "created_at")
    );
