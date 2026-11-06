CREATE TABLE support_email_threads (
 id UUID PRIMARY KEY, ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 source_message_id UUID NOT NULL REFERENCES ticket_messages(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 sender_hash CHAR(64) NOT NULL, expires_at TIMESTAMPTZ(3) NOT NULL,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX support_email_threads_source_message_id_recipient_user_id_key ON support_email_threads(source_message_id,recipient_user_id);
CREATE TABLE support_email_receipts (
 id UUID PRIMARY KEY, delivery_key CHAR(64) NOT NULL UNIQUE, accepted_message_key CHAR(64) UNIQUE,
 payload_hash CHAR(64) NOT NULL, thread_id UUID REFERENCES support_email_threads(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 message_id UUID UNIQUE REFERENCES ticket_messages(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 outcome VARCHAR(20) NOT NULL, reason VARCHAR(40) NOT NULL,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT support_email_receipt_shape CHECK (
 outcome IN ('ACCEPTED','REJECTED','IGNORED') AND
 ((outcome = 'ACCEPTED') = (message_id IS NOT NULL AND accepted_message_key IS NOT NULL)) AND
 (outcome <> 'ACCEPTED' OR thread_id IS NOT NULL)
 )
);
