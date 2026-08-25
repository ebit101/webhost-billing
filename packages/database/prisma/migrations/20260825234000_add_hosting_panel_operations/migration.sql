CREATE TYPE "HostingPanelOperationType" AS ENUM (
  'TEST_CONNECTION',
  'CREATE_ACCOUNT',
  'GET_ACCOUNT',
  'SUSPEND_ACCOUNT',
  'UNSUSPEND_ACCOUNT',
  'CHANGE_PACKAGE',
  'CHANGE_PASSWORD',
  'GENERATE_LOGIN_URL',
  'TERMINATE_ACCOUNT'
);

CREATE TYPE "HostingPanelOperationStatus" AS ENUM (
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'INCONSISTENT'
);

CREATE TYPE "HostingPanelErrorKind" AS ENUM (
  'TEMPORARY',
  'PERMANENT',
  'INCONSISTENT'
);

CREATE TABLE "hosting_panel_operations" (
  "id" UUID NOT NULL,
  "service_id" UUID,
  "server_id" UUID NOT NULL,
  "requested_by_user_id" UUID NOT NULL,
  "retry_of_operation_id" UUID,
  "type" "HostingPanelOperationType" NOT NULL,
  "status" "HostingPanelOperationStatus" NOT NULL DEFAULT 'RUNNING',
  "adapter_key" VARCHAR(64) NOT NULL,
  "idempotency_key" VARCHAR(191) NOT NULL,
  "request_fingerprint" CHAR(64) NOT NULL,
  "attempt_number" INTEGER NOT NULL DEFAULT 1,
  "retryable" BOOLEAN NOT NULL DEFAULT false,
  "error_kind" "HostingPanelErrorKind",
  "error_code" VARCHAR(80),
  "error_message" TEXT,
  "request_metadata" JSONB,
  "result_metadata" JSONB,
  "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "hosting_panel_operations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "hosting_panel_operations_idempotency_key_key" UNIQUE ("idempotency_key"),
  CONSTRAINT "hosting_panel_operations_attempt_check" CHECK ("attempt_number" > 0),
  CONSTRAINT "hosting_panel_operations_fingerprint_check" CHECK ("request_fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "hosting_panel_operations_service_scope_check" CHECK (
    ("type" = 'TEST_CONNECTION' AND "service_id" IS NULL)
    OR ("type" <> 'TEST_CONNECTION' AND "service_id" IS NOT NULL)
  ),
  CONSTRAINT "hosting_panel_operations_metadata_object_check" CHECK (
    ("request_metadata" IS NULL OR jsonb_typeof("request_metadata") = 'object')
    AND ("result_metadata" IS NULL OR jsonb_typeof("result_metadata") = 'object')
  ),
  CONSTRAINT "hosting_panel_operations_status_evidence_check" CHECK (
    (
      "status" = 'RUNNING'
      AND "completed_at" IS NULL
      AND "retryable" = false
      AND "error_kind" IS NULL
      AND "error_code" IS NULL
      AND "error_message" IS NULL
    )
    OR (
      "status" = 'SUCCEEDED'
      AND "completed_at" IS NOT NULL
      AND "retryable" = false
      AND "error_kind" IS NULL
      AND "error_code" IS NULL
      AND "error_message" IS NULL
    )
    OR (
      "status" = 'FAILED'
      AND "completed_at" IS NOT NULL
      AND "error_kind" IN ('TEMPORARY', 'PERMANENT')
      AND "error_code" IS NOT NULL
      AND "error_message" IS NOT NULL
      AND "retryable" = ("error_kind" = 'TEMPORARY')
    )
    OR (
      "status" = 'INCONSISTENT'
      AND "completed_at" IS NOT NULL
      AND "retryable" = false
      AND "error_kind" = 'INCONSISTENT'
      AND "error_code" IS NOT NULL
      AND "error_message" IS NOT NULL
    )
  ),
  CONSTRAINT "hosting_panel_operations_retry_self_check" CHECK (
    "retry_of_operation_id" IS NULL OR "retry_of_operation_id" <> "id"
  )
);

ALTER TABLE "hosting_panel_operations"
ADD CONSTRAINT "hosting_panel_operations_service_id_fkey"
FOREIGN KEY ("service_id") REFERENCES "services"("id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "hosting_panel_operations_server_id_fkey"
FOREIGN KEY ("server_id") REFERENCES "servers"("id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "hosting_panel_operations_requested_by_user_id_fkey"
FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "hosting_panel_operations_retry_of_operation_id_fkey"
FOREIGN KEY ("retry_of_operation_id") REFERENCES "hosting_panel_operations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "hosting_panel_operations_service_created_at_idx"
ON "hosting_panel_operations"("service_id", "created_at");

CREATE INDEX "hosting_panel_operations_server_created_at_idx"
ON "hosting_panel_operations"("server_id", "created_at");

CREATE INDEX "hosting_panel_operations_status_created_at_idx"
ON "hosting_panel_operations"("status", "created_at");

CREATE INDEX "hosting_panel_operations_retry_of_operation_id_idx"
ON "hosting_panel_operations"("retry_of_operation_id");
