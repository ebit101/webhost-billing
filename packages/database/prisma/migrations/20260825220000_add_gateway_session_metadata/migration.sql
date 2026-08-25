ALTER TABLE "payments"
ADD COLUMN "provider_checkout_url" TEXT,
ADD COLUMN "provider_session_expires_at" TIMESTAMPTZ(3);
