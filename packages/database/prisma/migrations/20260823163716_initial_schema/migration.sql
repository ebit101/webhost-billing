-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BillingPeriod" AS ENUM ('ONE_TIME', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'BIENNIAL', 'TRIENNIAL');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'AWAITING_PAYMENT', 'PAID', 'PROCESSING', 'COMPLETED', 'REJECTED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('PENDING', 'PROVISIONING', 'ACTIVE', 'SUSPENDED', 'PROVISION_FAILED', 'CANCELLED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "ServerStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'DISABLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'UNPAID', 'PAID', 'OVERDUE', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('CHARGE', 'REFUND', 'REVERSAL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'WAITING_FOR_CUSTOMER', 'WAITING_FOR_STAFF', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TicketMessageKind" AS ENUM ('CUSTOMER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "AutomationStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIALLY_SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "SettingCategory" AS ENUM ('BUSINESS', 'BILLING', 'AUTOMATION', 'EMAIL', 'INTEGRATION', 'SECURITY');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" VARCHAR(255),
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "email_verified_at" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "customer_number" VARCHAR(32) NOT NULL,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "company_name" VARCHAR(200),
    "phone" VARCHAR(32),
    "address_line_1" VARCHAR(200) NOT NULL,
    "address_line_2" VARCHAR(200),
    "city" VARCHAR(100) NOT NULL,
    "region" VARCHAR(100),
    "postal_code" VARCHAR(32),
    "country_code" CHAR(2) NOT NULL,
    "tax_identifier" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "display_name" VARCHAR(150) NOT NULL,
    "job_title" VARCHAR(100),
    "is_super_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "admin_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "provisioning_adapter" VARCHAR(64),
    "provisioning_config" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_prices" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "billing_period" "BillingPeriod" NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "amount" BIGINT NOT NULL,
    "setup_fee" BIGINT NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" TIMESTAMPTZ(3),
    "valid_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "product_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "order_number" VARCHAR(32) NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "currency" CHAR(3) NOT NULL,
    "subtotal" BIGINT NOT NULL,
    "setup_total" BIGINT NOT NULL DEFAULT 0,
    "discount_total" BIGINT NOT NULL DEFAULT 0,
    "tax_total" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL,
    "customer_email_snapshot" VARCHAR(320) NOT NULL,
    "notes" TEXT,
    "placed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_price_id" UUID NOT NULL,
    "product_name_snapshot" VARCHAR(160) NOT NULL,
    "description_snapshot" TEXT,
    "billing_period" "BillingPeriod" NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "unit_amount" BIGINT NOT NULL,
    "setup_fee" BIGINT NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "line_total" BIGINT NOT NULL,
    "requested_domain" VARCHAR(253),
    "provisioning_snapshot" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "order_item_id" UUID,
    "product_id" UUID NOT NULL,
    "server_id" UUID,
    "status" "ServiceStatus" NOT NULL DEFAULT 'PENDING',
    "domain" VARCHAR(253),
    "control_panel_username" VARCHAR(64),
    "external_account_id" VARCHAR(191),
    "billing_period" "BillingPeriod" NOT NULL,
    "recurring_amount" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "next_due_at" TIMESTAMPTZ(3),
    "activated_at" TIMESTAMPTZ(3),
    "suspended_at" TIMESTAMPTZ(3),
    "terminated_at" TIMESTAMPTZ(3),
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "hostname" VARCHAR(253) NOT NULL,
    "status" "ServerStatus" NOT NULL DEFAULT 'ACTIVE',
    "adapter_key" VARCHAR(64) NOT NULL,
    "api_username" VARCHAR(128),
    "credentials_ciphertext" TEXT,
    "credential_key_version" VARCHAR(64),
    "port" INTEGER NOT NULL DEFAULT 2087,
    "use_tls" BOOLEAN NOT NULL DEFAULT true,
    "max_accounts" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "invoice_number" VARCHAR(32) NOT NULL,
    "customer_id" UUID NOT NULL,
    "order_id" UUID,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" CHAR(3) NOT NULL,
    "subtotal" BIGINT NOT NULL,
    "discount_total" BIGINT NOT NULL DEFAULT 0,
    "tax_total" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL,
    "amount_paid" BIGINT NOT NULL DEFAULT 0,
    "balance_due" BIGINT NOT NULL,
    "customer_name_snapshot" VARCHAR(200) NOT NULL,
    "customer_email_snapshot" VARCHAR(320) NOT NULL,
    "customer_address_snapshot" JSONB NOT NULL,
    "business_identity_snapshot" JSONB NOT NULL,
    "tax_identity_snapshot" JSONB,
    "issued_at" TIMESTAMPTZ(3),
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "paid_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "order_item_id" UUID,
    "service_id" UUID,
    "description_snapshot" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_amount" BIGINT NOT NULL,
    "discount_amount" BIGINT NOT NULL DEFAULT 0,
    "tax_amount" BIGINT NOT NULL DEFAULT 0,
    "line_total" BIGINT NOT NULL,
    "service_period_start" TIMESTAMPTZ(3),
    "service_period_end" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "original_payment_id" UUID,
    "created_by_user_id" UUID,
    "kind" "PaymentKind" NOT NULL DEFAULT 'CHARGE',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" VARCHAR(64) NOT NULL,
    "provider_transaction_id" VARCHAR(191),
    "idempotency_key" VARCHAR(191) NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "reference" VARCHAR(191),
    "failure_reason" TEXT,
    "received_at" TIMESTAMPTZ(3),
    "verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "payment_id" UUID,
    "provider" VARCHAR(64) NOT NULL,
    "provider_event_id" VARCHAR(191) NOT NULL,
    "idempotency_key" VARCHAR(191) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "status" "PaymentEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "payload_hash" CHAR(64) NOT NULL,
    "normalized_payload" JSONB,
    "error_message" TEXT,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "ticket_number" VARCHAR(32) NOT NULL,
    "customer_id" UUID NOT NULL,
    "service_id" UUID,
    "assigned_admin_id" UUID,
    "subject" VARCHAR(200) NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "last_reply_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_messages" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "kind" "TicketMessageKind" NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" UUID NOT NULL,
    "customer_id" UUID,
    "invoice_id" UUID,
    "ticket_id" UUID,
    "template_key" VARCHAR(100) NOT NULL,
    "recipient_email" VARCHAR(320) NOT NULL,
    "subject_snapshot" VARCHAR(255) NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" VARCHAR(64),
    "provider_message_id" VARCHAR(191),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "queued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "entity_type" VARCHAR(80) NOT NULL,
    "entity_id" UUID,
    "correlation_id" UUID,
    "metadata" JSONB,
    "ip_address_hash" CHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_runs" (
    "id" UUID NOT NULL,
    "job_name" VARCHAR(100) NOT NULL,
    "idempotency_key" VARCHAR(191) NOT NULL,
    "status" "AutomationStatus" NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "processed_count" INTEGER NOT NULL DEFAULT 0,
    "succeeded_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "error_summary" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" UUID NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "category" "SettingCategory" NOT NULL,
    "value" JSONB NOT NULL,
    "description" VARCHAR(255),
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "aggregate_type" VARCHAR(80) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" VARCHAR(120) NOT NULL,
    "idempotency_key" VARCHAR(191) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(3),
    "locked_by" VARCHAR(120),
    "published_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "customers_user_id_key" ON "customers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_number_key" ON "customers"("customer_number");

-- CreateIndex
CREATE INDEX "customers_status_deleted_at_idx" ON "customers"("status", "deleted_at");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("last_name", "first_name");

-- CreateIndex
CREATE UNIQUE INDEX "admin_profiles_user_id_key" ON "admin_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_status_deleted_at_idx" ON "products"("status", "deleted_at");

-- CreateIndex
CREATE INDEX "product_prices_lookup_idx" ON "product_prices"("product_id", "billing_period", "currency");

-- CreateIndex
CREATE INDEX "product_prices_active_idx" ON "product_prices"("is_active", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE INDEX "orders_customer_created_at_idx" ON "orders"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "services_order_item_id_key" ON "services"("order_item_id");

-- CreateIndex
CREATE INDEX "services_customer_status_idx" ON "services"("customer_id", "status");

-- CreateIndex
CREATE INDEX "services_status_next_due_at_idx" ON "services"("status", "next_due_at");

-- CreateIndex
CREATE INDEX "services_server_status_idx" ON "services"("server_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "services_server_external_account_key" ON "services"("server_id", "external_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "servers_name_key" ON "servers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "servers_hostname_key" ON "servers"("hostname");

-- CreateIndex
CREATE INDEX "servers_status_deleted_at_idx" ON "servers"("status", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoices_customer_created_at_idx" ON "invoices"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "invoices_status_due_at_idx" ON "invoices"("status", "due_at");

-- CreateIndex
CREATE INDEX "invoices_order_id_idx" ON "invoices"("order_id");

-- CreateIndex
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_items_service_id_idx" ON "invoice_items"("service_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_invoice_status_idx" ON "payments"("invoice_id", "status");

-- CreateIndex
CREATE INDEX "payments_original_payment_id_idx" ON "payments"("original_payment_id");

-- CreateIndex
CREATE INDEX "payments_created_at_idx" ON "payments"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_transaction_key" ON "payments"("provider", "provider_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_idempotency_key" ON "payment_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "payment_events_status_received_at_idx" ON "payment_events"("status", "received_at");

-- CreateIndex
CREATE INDEX "payment_events_payment_id_idx" ON "payment_events"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_provider_event_key" ON "payment_events"("provider", "provider_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_number_key" ON "tickets"("ticket_number");

-- CreateIndex
CREATE INDEX "tickets_customer_status_idx" ON "tickets"("customer_id", "status");

-- CreateIndex
CREATE INDEX "tickets_assignee_status_idx" ON "tickets"("assigned_admin_id", "status");

-- CreateIndex
CREATE INDEX "tickets_queue_idx" ON "tickets"("status", "priority", "updated_at");

-- CreateIndex
CREATE INDEX "ticket_messages_ticket_created_at_idx" ON "ticket_messages"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "ticket_messages_author_user_id_idx" ON "ticket_messages"("author_user_id");

-- CreateIndex
CREATE INDEX "email_logs_status_queued_at_idx" ON "email_logs"("status", "queued_at");

-- CreateIndex
CREATE INDEX "email_logs_customer_queued_at_idx" ON "email_logs"("customer_id", "queued_at");

-- CreateIndex
CREATE INDEX "email_logs_invoice_id_idx" ON "email_logs"("invoice_id");

-- CreateIndex
CREATE INDEX "email_logs_ticket_id_idx" ON "email_logs"("ticket_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_logs_provider_message_key" ON "email_logs"("provider", "provider_message_id");

-- CreateIndex
CREATE INDEX "activity_logs_actor_created_at_idx" ON "activity_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_logs_entity_created_at_idx" ON "activity_logs"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "automation_runs_idempotency_key" ON "automation_runs"("idempotency_key");

-- CreateIndex
CREATE INDEX "automation_runs_job_started_at_idx" ON "automation_runs"("job_name", "started_at");

-- CreateIndex
CREATE INDEX "automation_runs_status_started_at_idx" ON "automation_runs"("status", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE INDEX "settings_category_idx" ON "settings"("category");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_idempotency_key" ON "outbox_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "outbox_events_dispatch_idx" ON "outbox_events"("status", "available_at");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_idx" ON "outbox_events"("aggregate_type", "aggregate_id", "created_at");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_profiles" ADD CONSTRAINT "admin_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_price_id_fkey" FOREIGN KEY ("product_price_id") REFERENCES "product_prices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_original_payment_id_fkey" FOREIGN KEY ("original_payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_admin_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain checks not expressible in Prisma Schema Language.
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_normalized_check"
  CHECK ("email" = LOWER(BTRIM("email")));

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_country_code_check"
  CHECK ("country_code" ~ '^[A-Z]{2}$');

ALTER TABLE "product_prices"
  ADD CONSTRAINT "product_prices_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "product_prices_amount_check" CHECK ("amount" >= 0 AND "setup_fee" >= 0),
  ADD CONSTRAINT "product_prices_valid_range_check" CHECK ("valid_until" IS NULL OR "valid_from" IS NULL OR "valid_until" > "valid_from");

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "orders_amounts_check" CHECK ("subtotal" >= 0 AND "setup_total" >= 0 AND "discount_total" >= 0 AND "tax_total" >= 0 AND "total" >= 0),
  ADD CONSTRAINT "orders_total_check" CHECK ("total" = "subtotal" + "setup_total" - "discount_total" + "tax_total");

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "order_items_quantity_check" CHECK ("quantity" > 0),
  ADD CONSTRAINT "order_items_amounts_check" CHECK ("unit_amount" >= 0 AND "setup_fee" >= 0 AND "line_total" >= 0),
  ADD CONSTRAINT "order_items_total_check" CHECK ("line_total" = ("unit_amount" * "quantity") + "setup_fee");

ALTER TABLE "services"
  ADD CONSTRAINT "services_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "services_recurring_amount_check" CHECK ("recurring_amount" >= 0);

ALTER TABLE "servers"
  ADD CONSTRAINT "servers_port_check" CHECK ("port" BETWEEN 1 AND 65535),
  ADD CONSTRAINT "servers_max_accounts_check" CHECK ("max_accounts" IS NULL OR "max_accounts" > 0);

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "invoices_amounts_check" CHECK ("subtotal" >= 0 AND "discount_total" >= 0 AND "tax_total" >= 0 AND "total" >= 0 AND "amount_paid" >= 0 AND "balance_due" >= 0),
  ADD CONSTRAINT "invoices_total_check" CHECK ("total" = "subtotal" - "discount_total" + "tax_total"),
  ADD CONSTRAINT "invoices_balance_check" CHECK ("balance_due" = "total" - "amount_paid"),
  ADD CONSTRAINT "invoices_due_date_check" CHECK ("issued_at" IS NULL OR "due_at" >= "issued_at"),
  ADD CONSTRAINT "invoices_customer_address_object_check" CHECK (JSONB_TYPEOF("customer_address_snapshot") = 'object'),
  ADD CONSTRAINT "invoices_business_identity_object_check" CHECK (JSONB_TYPEOF("business_identity_snapshot") = 'object');

ALTER TABLE "invoice_items"
  ADD CONSTRAINT "invoice_items_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "invoice_items_quantity_check" CHECK ("quantity" > 0),
  ADD CONSTRAINT "invoice_items_amounts_check" CHECK ("unit_amount" >= 0 AND "discount_amount" >= 0 AND "tax_amount" >= 0 AND "line_total" >= 0),
  ADD CONSTRAINT "invoice_items_total_check" CHECK ("line_total" = ("unit_amount" * "quantity") - "discount_amount" + "tax_amount"),
  ADD CONSTRAINT "invoice_items_service_period_check" CHECK ("service_period_end" IS NULL OR "service_period_start" IS NULL OR "service_period_end" > "service_period_start");

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "payments_amount_check" CHECK ("amount" > 0),
  ADD CONSTRAINT "payments_adjustment_reference_check" CHECK (("kind" = 'CHARGE' AND "original_payment_id" IS NULL) OR ("kind" IN ('REFUND', 'REVERSAL') AND "original_payment_id" IS NOT NULL)),
  ADD CONSTRAINT "payments_not_self_referential_check" CHECK ("original_payment_id" IS NULL OR "original_payment_id" <> "id");

ALTER TABLE "email_logs"
  ADD CONSTRAINT "email_logs_attempt_count_check" CHECK ("attempt_count" >= 0);

ALTER TABLE "automation_runs"
  ADD CONSTRAINT "automation_runs_counts_check" CHECK ("processed_count" >= 0 AND "succeeded_count" >= 0 AND "failed_count" >= 0 AND "succeeded_count" + "failed_count" <= "processed_count");

ALTER TABLE "outbox_events"
  ADD CONSTRAINT "outbox_events_attempt_count_check" CHECK ("attempt_count" >= 0);

-- Only one currently active, non-deleted price may exist per product/period/currency.
CREATE UNIQUE INDEX "product_prices_one_active_key"
  ON "product_prices" ("product_id", "billing_period", "currency")
  WHERE "is_active" = true AND "deleted_at" IS NULL;
