CREATE TABLE "support_departments" (
 "id" UUID NOT NULL, "name" VARCHAR(80) NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true,
 "customer_visible" BOOLEAN NOT NULL DEFAULT true, "restricted" BOOLEAN NOT NULL DEFAULT false,
 "revision" INTEGER NOT NULL DEFAULT 1, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "support_departments_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "support_departments_revision_check" CHECK ("revision" > 0)
);
CREATE UNIQUE INDEX "support_departments_name_key" ON "support_departments"("name");
INSERT INTO "support_departments" ("id", "name") VALUES
 ('21600000-0000-4000-8000-000000000001', 'Support'),
 ('21600000-0000-4000-8000-000000000002', 'Billing'),
 ('21600000-0000-4000-8000-000000000003', 'Sales');
CREATE TABLE "support_department_members" (
 "id" UUID NOT NULL, "department_id" UUID NOT NULL, "user_id" UUID NOT NULL,
 CONSTRAINT "support_department_members_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "support_department_members_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "support_departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "support_department_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "support_department_members_department_id_user_id_key" ON "support_department_members"("department_id", "user_id");
CREATE INDEX "support_department_members_user_id_idx" ON "support_department_members"("user_id");
ALTER TABLE "tickets" ADD COLUMN "department_id" UUID NOT NULL DEFAULT '21600000-0000-4000-8000-000000000001';
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "support_departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "tickets_department_status_idx" ON "tickets"("department_id", "status");
