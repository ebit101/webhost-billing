CREATE TABLE ssl_checkouts (
 id UUID PRIMARY KEY, payment_id UUID NOT NULL UNIQUE REFERENCES payments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 merchant_reference VARCHAR(30) NOT NULL UNIQUE, environment VARCHAR(12) NOT NULL DEFAULT 'SANDBOX',
 account_hash CHAR(64) NOT NULL, credential_ciphertext TEXT NOT NULL, credential_key_version VARCHAR(64) NOT NULL,
 credential_revision VARCHAR(100) NOT NULL, state VARCHAR(20) NOT NULL DEFAULT 'CREATING', session_key VARCHAR(191),
 bank_reference VARCHAR(120) UNIQUE, captured_at TIMESTAMPTZ(3), applied_to_invoice BOOLEAN NOT NULL DEFAULT false,
 review_reason VARCHAR(500), created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT ssl_checkout_shape CHECK (environment='SANDBOX' AND state IN ('CREATING','OPEN','UNKNOWN','FAILED','CAPTURED') AND
 (state<>'CAPTURED' OR (bank_reference IS NOT NULL AND captured_at IS NOT NULL)) AND (NOT applied_to_invoice OR state='CAPTURED'))
);
CREATE INDEX ssl_checkouts_invoice_id_created_at_idx ON ssl_checkouts(invoice_id,created_at);
CREATE UNIQUE INDEX ssl_one_unresolved_checkout ON ssl_checkouts(invoice_id) WHERE state IN ('CREATING','OPEN','UNKNOWN');
CREATE TABLE ssl_refunds (
 id UUID PRIMARY KEY, checkout_id UUID NOT NULL REFERENCES ssl_checkouts(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 submission_key UUID NOT NULL UNIQUE, amount BIGINT NOT NULL, reason VARCHAR(500) NOT NULL, actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 state VARCHAR(20) NOT NULL DEFAULT 'SUBMITTING', provider_reference VARCHAR(191) UNIQUE,
 payment_id UUID UNIQUE REFERENCES payments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT ssl_refund_shape CHECK (amount>0 AND state IN ('SUBMITTING','PENDING','UNKNOWN','SUCCEEDED','FAILED') AND ((state='SUCCEEDED')=(payment_id IS NOT NULL)))
);
CREATE INDEX ssl_refunds_checkout_id_created_at_idx ON ssl_refunds(checkout_id,created_at);
CREATE FUNCTION ssl_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Gateway history is retained'; END IF;
 IF TG_TABLE_NAME='ssl_checkouts' THEN
  IF (NEW.payment_id,NEW.invoice_id,NEW.merchant_reference,NEW.environment,NEW.account_hash,NEW.credential_ciphertext,NEW.credential_key_version,NEW.credential_revision,NEW.created_at) IS DISTINCT FROM
     (OLD.payment_id,OLD.invoice_id,OLD.merchant_reference,OLD.environment,OLD.account_hash,OLD.credential_ciphertext,OLD.credential_key_version,OLD.credential_revision,OLD.created_at)
     OR (OLD.state='CAPTURED' AND (NEW.state,NEW.bank_reference,NEW.captured_at,NEW.applied_to_invoice) IS DISTINCT FROM (OLD.state,OLD.bank_reference,OLD.captured_at,OLD.applied_to_invoice)) THEN RAISE EXCEPTION 'Gateway intent and capture are immutable'; END IF;
 ELSE
  IF (NEW.checkout_id,NEW.submission_key,NEW.amount,NEW.reason,NEW.actor_user_id,NEW.created_at) IS DISTINCT FROM (OLD.checkout_id,OLD.submission_key,OLD.amount,OLD.reason,OLD.actor_user_id,OLD.created_at)
     OR (OLD.state IN ('SUCCEEDED','FAILED') AND NEW IS DISTINCT FROM OLD) THEN RAISE EXCEPTION 'Refund history is immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ssl_checkout_history BEFORE UPDATE OR DELETE ON ssl_checkouts FOR EACH ROW EXECUTE FUNCTION ssl_history_guard();
CREATE TRIGGER ssl_refund_history BEFORE UPDATE OR DELETE ON ssl_refunds FOR EACH ROW EXECUTE FUNCTION ssl_history_guard();
