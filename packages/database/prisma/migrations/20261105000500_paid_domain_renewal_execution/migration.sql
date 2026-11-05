BEGIN;
CREATE TABLE domain_renewal_operations (
 id UUID PRIMARY KEY, renewal_invoice_id UUID NOT NULL REFERENCES domain_renewal_invoices(id) ON DELETE RESTRICT,
 domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE RESTRICT,
 account_id UUID NOT NULL REFERENCES registrar_accounts(id) ON DELETE RESTRICT,
 customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 credential_id UUID NOT NULL REFERENCES registrar_credentials(id) ON DELETE RESTRICT,
 approved_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 binding_hash CHAR(64) NOT NULL, reference JSONB NOT NULL, cost_ceiling BIGINT NOT NULL,
 cost_currency CHAR(3) NOT NULL DEFAULT 'USD', attempt INTEGER NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'QUEUED', code VARCHAR(64), lease_token UUID,
 lease_until TIMESTAMPTZ(3), read_count INTEGER NOT NULL DEFAULT 0,
 submitted_at TIMESTAMPTZ(3), completed_at TIMESTAMPTZ(3), expiry_after TIMESTAMPTZ(3),
 financial_review_required BOOLEAN NOT NULL DEFAULT false,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(renewal_invoice_id,attempt),
 CONSTRAINT domain_renewal_operations_state_check CHECK (
 status IN ('QUEUED','RUNNING','REJECTED','NEEDS_RECONCILIATION','SUCCEEDED')
 AND cost_ceiling>0 AND cost_ceiling<=999999999999999 AND cost_currency='USD' AND attempt>0
 AND read_count BETWEEN 0 AND 10 AND binding_hash ~ '^[a-f0-9]{64}$'
 AND jsonb_typeof(reference)='object' AND (code IS NULL OR code ~ '^[A-Z_]{1,64}$')
 AND (status<>'REJECTED' OR submitted_at IS NULL)
 AND (status<>'SUCCEEDED' OR (submitted_at IS NOT NULL AND completed_at IS NOT NULL AND expiry_after IS NOT NULL))
 )
);
CREATE INDEX domain_renewal_operations_domain_created_idx ON domain_renewal_operations(domain_id,created_at);
CREATE UNIQUE INDEX domain_renewal_operations_active_domain_key ON domain_renewal_operations(domain_id) WHERE status IN ('QUEUED','RUNNING','NEEDS_RECONCILIATION');
CREATE UNIQUE INDEX domain_renewal_operations_one_success_key ON domain_renewal_operations(renewal_invoice_id) WHERE status='SUCCEEDED';
CREATE FUNCTION domain_renewal_operation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Renewal operation history is retained'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.id,NEW.renewal_invoice_id,NEW.domain_id,NEW.account_id,NEW.customer_id,NEW.credential_id,NEW.approved_by_user_id,NEW.binding_hash,NEW.reference,NEW.cost_ceiling,NEW.cost_currency,NEW.attempt,NEW.created_at)
    IS DISTINCT FROM (OLD.id,OLD.renewal_invoice_id,OLD.domain_id,OLD.account_id,OLD.customer_id,OLD.credential_id,OLD.approved_by_user_id,OLD.binding_hash,OLD.reference,OLD.cost_ceiling,OLD.cost_currency,OLD.attempt,OLD.created_at)
   OR (OLD.submitted_at IS NOT NULL AND NEW.submitted_at IS DISTINCT FROM OLD.submitted_at)
   OR NEW.read_count<OLD.read_count OR OLD.status IN ('REJECTED','SUCCEEDED')
  THEN RAISE EXCEPTION 'Renewal identity, submission and terminal history are immutable'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM domain_renewal_invoices r JOIN domains d ON d.id=r.domain_id
   JOIN registrar_credentials c ON c.id=NEW.credential_id
   WHERE r.id=NEW.renewal_invoice_id AND d.id=NEW.domain_id AND d.customer_id=NEW.customer_id
   AND COALESCE(d.execution_account_id,d.account_id)=NEW.account_id AND c.account_id=NEW.account_id
   AND NEW.reference->>'accountId'=NEW.account_id::text AND NEW.reference->>'customerId'=NEW.customer_id::text
   AND NEW.reference->>'domainName'=d.domain_name AND NEW.reference->>'providerOrderId'=d.provider_order_id
   AND NEW.reference->>'years'='1' AND (NEW.reference->>'previousExpiry')::timestamptz=r.term_start
   AND (NEW.reference->>'targetExpiry')::timestamptz=r.term_end)
 THEN RAISE EXCEPTION 'Renewal operation ownership mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER domain_renewal_operations_history BEFORE INSERT OR UPDATE OR DELETE ON domain_renewal_operations FOR EACH ROW EXECUTE FUNCTION domain_renewal_operation_guard();
CREATE TABLE fake_registrar_renewals (
 operation_id UUID PRIMARY KEY REFERENCES domain_renewal_operations(id) ON DELETE RESTRICT,
 registration_id UUID NOT NULL REFERENCES fake_registrar_registrations(id) ON DELETE RESTRICT,
 previous_expiry TIMESTAMPTZ(3) NOT NULL, target_expiry TIMESTAMPTZ(3) NOT NULL,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(registration_id,previous_expiry), CHECK(target_expiry>previous_expiry)
);
CREATE TRIGGER fake_registrar_renewals_immutable BEFORE UPDATE OR DELETE ON fake_registrar_renewals FOR EACH ROW EXECUTE FUNCTION registrar_append_only();
COMMIT;
