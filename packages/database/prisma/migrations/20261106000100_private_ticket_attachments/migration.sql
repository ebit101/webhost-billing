CREATE TABLE "ticket_attachment_blobs" (
 "id" UUID PRIMARY KEY, "content" BYTEA NOT NULL,
 CONSTRAINT "ticket_attachment_blob_size" CHECK (octet_length("content") BETWEEN 1 AND 2097152)
);
CREATE TABLE "ticket_attachments" (
 "id" UUID PRIMARY KEY, "uploader_user_id" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "message_submission_key" UUID NOT NULL, "department_id" UUID NOT NULL,
 "ticket_id" UUID REFERENCES tickets(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "message_id" UUID REFERENCES ticket_messages(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "blob_id" UUID REFERENCES ticket_attachment_blobs(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "filename" VARCHAR(120) NOT NULL, "media_type" VARCHAR(40) NOT NULL,
 "declared_size" INTEGER NOT NULL, "size_bytes" INTEGER NOT NULL DEFAULT 0,
 "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING', "scanner" VARCHAR(20), "sha256" VARCHAR(64),
 "claim_token" UUID, "lease_until" TIMESTAMPTZ(3), "expires_at" TIMESTAMPTZ(3) NOT NULL,
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ticket_attachment_shape" CHECK (
 "declared_size" BETWEEN 1 AND 2097152 AND "size_bytes" BETWEEN 0 AND 2097152
 AND "media_type" IN ('image/png','image/jpeg','text/plain')
 AND "status" IN ('PENDING','UPLOADING','READY','ATTACHED','QUARANTINED','REJECTED','EXPIRED')
 AND (("status" IN ('READY','ATTACHED')) = ("blob_id" IS NOT NULL))
 AND ("status" <> 'ATTACHED' OR ("message_id" IS NOT NULL AND "ticket_id" IS NOT NULL))
 AND ("message_id" IS NULL OR "status" IN ('ATTACHED','EXPIRED'))
 AND (("status" = 'UPLOADING') = ("claim_token" IS NOT NULL AND "lease_until" IS NOT NULL))
 AND ("status" NOT IN ('READY','ATTACHED') OR ("scanner" IN ('fake','clamav') AND "sha256" IS NOT NULL AND "size_bytes" > 0))
 )
);
CREATE UNIQUE INDEX "ticket_attachments_blob_id_key" ON "ticket_attachments"("blob_id");
CREATE INDEX "ticket_attachments_uploader_user_id_message_submission_key_idx" ON "ticket_attachments"("uploader_user_id","message_submission_key");
CREATE INDEX "ticket_attachments_status_expires_at_idx" ON "ticket_attachments"("status","expires_at");
