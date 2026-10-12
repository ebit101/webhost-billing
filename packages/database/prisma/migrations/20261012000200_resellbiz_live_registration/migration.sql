BEGIN;
ALTER TABLE registrar_accounts ADD COLUMN configuration JSONB;
ALTER TABLE registrar_operations ADD COLUMN price_change_risk_accepted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE domains ADD COLUMN management_snapshot JSONB;
ALTER TABLE domains ADD COLUMN current_contact_ciphertext TEXT;
ALTER TABLE registrar_accounts DROP CONSTRAINT registrar_fake_only;
ALTER TABLE registrar_accounts ADD CONSTRAINT registrar_mode CHECK (
  provider='stargate' AND (
    (mode='FAKE' AND configuration IS NULL) OR
    (mode='LIVE' AND configuration IS NOT NULL AND jsonb_typeof(configuration)='object')
  )
);
CREATE UNIQUE INDEX registrar_single_live_account ON registrar_accounts(mode) WHERE mode='LIVE';
CREATE FUNCTION registrar_account_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (NEW.id,NEW.provider,NEW.mode,NEW.configuration,NEW.created_at) IS DISTINCT FROM
 (OLD.id,OLD.provider,OLD.mode,OLD.configuration,OLD.created_at) THEN
  RAISE EXCEPTION 'Registrar account identity and policy are immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER registrar_account_identity BEFORE UPDATE OR DELETE ON registrar_accounts FOR EACH ROW EXECUTE FUNCTION registrar_account_identity_guard();
CREATE FUNCTION registrar_live_operation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.price_change_risk_accepted IS DISTINCT FROM OLD.price_change_risk_accepted THEN
  RAISE EXCEPTION 'Registrar charge-risk approval is immutable';
 END IF;
 IF EXISTS(SELECT 1 FROM registrar_accounts WHERE id=NEW.account_id AND mode='LIVE') AND NOT NEW.price_change_risk_accepted THEN
  RAISE EXCEPTION 'Live registration needs explicit price-change risk acceptance';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER registrar_live_operation BEFORE INSERT OR UPDATE ON registrar_operations FOR EACH ROW EXECUTE FUNCTION registrar_live_operation_guard();
CREATE TABLE registrar_preparations (
 id UUID PRIMARY KEY,
 account_id UUID NOT NULL REFERENCES registrar_accounts(id) ON DELETE RESTRICT,
 customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 fingerprint CHAR(64) NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 operation_id UUID NOT NULL REFERENCES registrar_operations(id) ON DELETE RESTRICT,
 customer_claimed_at TIMESTAMPTZ(3), remote_customer_id VARCHAR(64),
 contact_claimed_at TIMESTAMPTZ(3), remote_contact_id VARCHAR(64),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(account_id,customer_id,fingerprint),
 CHECK(remote_customer_id IS NULL OR remote_customer_id ~ '^[1-9][0-9]{0,18}$'),
 CHECK(remote_contact_id IS NULL OR (remote_customer_id IS NOT NULL AND contact_claimed_at IS NOT NULL AND remote_contact_id ~ '^[1-9][0-9]{0,18}$'))
);
CREATE INDEX registrar_preparations_customer ON registrar_preparations(account_id,customer_id);
CREATE FUNCTION registrar_preparation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Registrar preparation is retained'; END IF;
 IF TG_OP='UPDATE' AND (
  (NEW.id,NEW.account_id,NEW.customer_id,NEW.fingerprint,NEW.operation_id,NEW.created_at) IS DISTINCT FROM
  (OLD.id,OLD.account_id,OLD.customer_id,OLD.fingerprint,OLD.operation_id,OLD.created_at) OR
  (OLD.customer_claimed_at IS NOT NULL AND NEW.customer_claimed_at IS DISTINCT FROM OLD.customer_claimed_at) OR
  (OLD.contact_claimed_at IS NOT NULL AND NEW.contact_claimed_at IS DISTINCT FROM OLD.contact_claimed_at) OR
  (OLD.remote_customer_id IS NOT NULL AND NEW.remote_customer_id IS DISTINCT FROM OLD.remote_customer_id) OR
  (OLD.remote_contact_id IS NOT NULL AND NEW.remote_contact_id IS DISTINCT FROM OLD.remote_contact_id)
 ) THEN RAISE EXCEPTION 'Registrar preparation claims and verified identities are immutable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM registrar_operations op JOIN registrar_accounts a ON a.id=op.account_id
  WHERE op.id=NEW.operation_id AND op.account_id=NEW.account_id AND op.customer_id=NEW.customer_id
  AND op.claimed_at IS NOT NULL AND a.mode='LIVE') THEN
  RAISE EXCEPTION 'Registrar preparation requires a claimed live operation';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER registrar_preparation BEFORE INSERT OR UPDATE OR DELETE ON registrar_preparations FOR EACH ROW EXECUTE FUNCTION registrar_preparation_guard();
CREATE TABLE domain_actions (
 id UUID PRIMARY KEY,
 domain_id UUID NOT NULL, customer_id UUID NOT NULL, account_id UUID NOT NULL,
 FOREIGN KEY(domain_id,customer_id,account_id) REFERENCES domains(id,customer_id,account_id) ON DELETE RESTRICT,
 credential_id UUID NOT NULL REFERENCES registrar_credentials(id) ON DELETE RESTRICT,
 actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 kind VARCHAR(16) NOT NULL CHECK(kind IN ('NAMESERVERS','LOCK','CONTACT','RENEW')),
 payload_ciphertext TEXT NOT NULL,
 invoice_id UUID REFERENCES invoices(id) ON DELETE RESTRICT,
 state VARCHAR(32) NOT NULL DEFAULT 'REQUESTED' CHECK(state IN ('REQUESTED','NEEDS_RECONCILIATION','SUCCEEDED','CANCELLED','FAILED')),
 claimed_at TIMESTAMPTZ(3), contact_claimed_at TIMESTAMPTZ(3), submitted_at TIMESTAMPTZ(3), remote_contact_id VARCHAR(64),
 next_poll_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 poll_count INTEGER NOT NULL DEFAULT 0 CHECK(poll_count BETWEEN 0 AND 10),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK((kind='RENEW')=(invoice_id IS NOT NULL)),
 CHECK(state!='CANCELLED' OR claimed_at IS NULL),
 CHECK(state!='FAILED' OR (submitted_at IS NULL AND contact_claimed_at IS NULL)),
 CHECK(submitted_at IS NULL OR claimed_at IS NOT NULL),
 CHECK(contact_claimed_at IS NULL OR (kind='CONTACT' AND claimed_at IS NOT NULL)),
 CHECK(remote_contact_id IS NULL OR (kind='CONTACT' AND contact_claimed_at IS NOT NULL AND remote_contact_id ~ '^[1-9][0-9]{0,18}$'))
);
CREATE INDEX domain_actions_domain ON domain_actions(domain_id,created_at);
CREATE UNIQUE INDEX domain_actions_one_open ON domain_actions(domain_id) WHERE state NOT IN ('SUCCEEDED','CANCELLED','FAILED');
CREATE FUNCTION domain_action_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Domain action history is retained'; END IF;
 IF TG_OP='UPDATE' AND (
  (NEW.id,NEW.domain_id,NEW.customer_id,NEW.account_id,NEW.credential_id,NEW.actor_user_id,NEW.kind,NEW.payload_ciphertext,NEW.invoice_id,NEW.created_at) IS DISTINCT FROM
  (OLD.id,OLD.domain_id,OLD.customer_id,OLD.account_id,OLD.credential_id,OLD.actor_user_id,OLD.kind,OLD.payload_ciphertext,OLD.invoice_id,OLD.created_at) OR
  (OLD.claimed_at IS NOT NULL AND NEW.claimed_at IS DISTINCT FROM OLD.claimed_at) OR
  (OLD.contact_claimed_at IS NOT NULL AND NEW.contact_claimed_at IS DISTINCT FROM OLD.contact_claimed_at) OR
  (OLD.submitted_at IS NOT NULL AND NEW.submitted_at IS DISTINCT FROM OLD.submitted_at) OR
  (OLD.remote_contact_id IS NOT NULL AND NEW.remote_contact_id IS DISTINCT FROM OLD.remote_contact_id) OR
  (OLD.state IN ('SUCCEEDED','CANCELLED','FAILED') AND NEW IS DISTINCT FROM OLD) OR
  NEW.poll_count<OLD.poll_count
 ) THEN RAISE EXCEPTION 'Domain action intent, claims and completed history are immutable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM registrar_credentials c WHERE c.id=NEW.credential_id AND c.account_id=NEW.account_id) THEN
  RAISE EXCEPTION 'Domain action credential account does not match'; END IF;
 IF NOT EXISTS(SELECT 1 FROM registrar_accounts a WHERE a.id=NEW.account_id AND a.mode='LIVE') THEN
  RAISE EXCEPTION 'Domain management actions require a live account'; END IF;
 IF NEW.kind='RENEW' AND NOT EXISTS(SELECT 1 FROM invoices i WHERE i.id=NEW.invoice_id AND i.customer_id=NEW.customer_id AND i.currency='BDT') THEN
  RAISE EXCEPTION 'Domain renewal invoice owner does not match'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER domain_action BEFORE INSERT OR UPDATE OR DELETE ON domain_actions FOR EACH ROW EXECUTE FUNCTION domain_action_guard();
COMMIT;
