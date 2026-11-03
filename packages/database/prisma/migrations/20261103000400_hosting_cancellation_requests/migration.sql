CREATE TYPE "HostingCancellationTiming" AS ENUM ('IMMEDIATE', 'END_OF_PERIOD');
CREATE TYPE "HostingCancellationStatus" AS ENUM ('OPEN', 'WITHDRAWN', 'COMPLETED');

CREATE TABLE "hosting_cancellation_requests" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "timing" "HostingCancellationTiming" NOT NULL,
    "status" "HostingCancellationStatus" NOT NULL DEFAULT 'OPEN',
    "reason" VARCHAR(1000),
    "effective_at" TIMESTAMPTZ(3),
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),
    CONSTRAINT "hosting_cancellation_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "hosting_cancellation_requests_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "hosting_cancellation_requests_timing_check" CHECK (("timing" = 'END_OF_PERIOD') = ("effective_at" IS NOT NULL)),
    CONSTRAINT "hosting_cancellation_requests_resolution_check" CHECK (("status" = 'OPEN') = ("resolved_at" IS NULL))
);

CREATE INDEX "hosting_cancellation_requests_status_created_at_idx" ON "hosting_cancellation_requests"("status", "created_at");
CREATE INDEX "hosting_cancellation_requests_service_id_created_at_idx" ON "hosting_cancellation_requests"("service_id", "created_at");
CREATE UNIQUE INDEX "hosting_cancellation_requests_one_effective_idx" ON "hosting_cancellation_requests"("service_id") WHERE "status" IN ('OPEN', 'COMPLETED');
