CREATE TABLE "customer_support_sessions" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "admin_session_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    CONSTRAINT "customer_support_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_support_sessions_admin_session_id_fkey" FOREIGN KEY ("admin_session_id") REFERENCES "auth_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "customer_support_sessions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "customer_support_sessions_token_hash_key" ON "customer_support_sessions"("token_hash");
CREATE INDEX "customer_support_sessions_admin_session_id_idx" ON "customer_support_sessions"("admin_session_id");
CREATE INDEX "customer_support_sessions_customer_id_idx" ON "customer_support_sessions"("customer_id");
