BEGIN;
ALTER TABLE domains
  ALTER COLUMN quote_id DROP NOT NULL,
  ALTER COLUMN order_item_id DROP NOT NULL,
  ALTER COLUMN invoice_id DROP NOT NULL,
  ADD COLUMN origin VARCHAR(16) NOT NULL DEFAULT 'REGISTRATION',
  ADD COLUMN link_credential_id UUID,
  ADD COLUMN link_evidence_ciphertext TEXT,
  ADD COLUMN ownership_verified_at TIMESTAMPTZ(3);
ALTER TABLE domains ADD CONSTRAINT domain_link_credential_fk
  FOREIGN KEY (link_credential_id, account_id)
  REFERENCES registrar_credentials(id, account_id) ON DELETE RESTRICT;
ALTER TABLE domains ADD CONSTRAINT domain_link_customer_fk
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;
ALTER TABLE domains ADD CONSTRAINT domain_origin_shape CHECK (
  (origin = 'REGISTRATION' AND quote_id IS NOT NULL AND order_item_id IS NOT NULL
    AND invoice_id IS NOT NULL AND link_credential_id IS NULL
    AND link_evidence_ciphertext IS NULL AND ownership_verified_at IS NULL)
  OR
  (origin = 'EXISTING' AND quote_id IS NULL AND order_item_id IS NULL
    AND invoice_id IS NULL AND link_credential_id IS NOT NULL
    AND link_evidence_ciphertext IS NOT NULL AND ownership_verified_at IS NOT NULL
    AND isfinite(ownership_verified_at) AND state = 'REGISTERED'
    AND provider_order_id IS NOT NULL AND provider_order_id ~ '^[1-9][0-9]{0,18}$'
    AND expires_at IS NOT NULL AND isfinite(expires_at)
    AND execution_account_id IS NOT DISTINCT FROM account_id)
);
CREATE OR REPLACE FUNCTION domain_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Domain history cannot be deleted'; END IF;
 IF TG_OP = 'UPDATE' AND (NEW.id,NEW.quote_id,NEW.customer_id,NEW.account_id,NEW.invoice_id,NEW.order_item_id,NEW.domain_name,NEW.submission_key,NEW.created_at) IS DISTINCT FROM
 (OLD.id,OLD.quote_id,OLD.customer_id,OLD.account_id,OLD.invoice_id,OLD.order_item_id,OLD.domain_name,OLD.submission_key,OLD.created_at) THEN RAISE EXCEPTION 'Domain identity is immutable'; END IF;
 IF NEW.origin = 'REGISTRATION' AND NOT EXISTS (
  SELECT 1 FROM invoices i
  JOIN order_items oi ON oi.order_id=i.order_id AND oi.id=NEW.order_item_id
  JOIN domain_quotes q ON q.id=NEW.quote_id
  JOIN invoice_items ii ON ii.invoice_id=i.id AND ii.order_item_id=oi.id
  WHERE i.id=NEW.invoice_id AND i.customer_id=NEW.customer_id
   AND i.currency='BDT' AND oi.kind='DOMAIN' AND oi.currency='BDT'
   AND oi.requested_domain=NEW.domain_name AND q.domain_name=NEW.domain_name
   AND q.customer_id=NEW.customer_id AND q.account_id=NEW.account_id
   AND q.selling_amount=oi.line_total AND ii.line_total=oi.line_total
   AND ii.currency='BDT' AND ii.quantity=1
   AND i.total=(SELECT COALESCE(SUM(line_total),0) FROM invoice_items WHERE invoice_id=i.id)
 ) THEN RAISE EXCEPTION 'Domain billing ownership mismatch'; END IF;
 IF NEW.origin = 'EXISTING' AND NOT EXISTS (SELECT 1 FROM registrar_accounts WHERE id=NEW.account_id AND mode='LIVE' AND provider='stargate') THEN RAISE EXCEPTION 'Existing domains require a live registrar identity'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION domain_execution_account_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' AND NEW.execution_account_id IS NOT NULL AND NEW.origin <> 'EXISTING' THEN
  RAISE EXCEPTION 'Registrar selection must follow creation of a domain request';
 END IF;
 IF TG_OP='UPDATE' AND NEW.execution_account_id IS DISTINCT FROM OLD.execution_account_id THEN
  IF OLD.execution_account_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM registrar_operations op
   WHERE op.domain_id=NEW.id AND op.selected_account_id=NEW.execution_account_id AND op.claimed_at IS NULL) THEN
   RAISE EXCEPTION 'Executed registrar must match its immutable approval';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION existing_domain_link_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.origin = 'EXISTING' THEN RAISE EXCEPTION 'Existing domain links cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF (NEW.origin, NEW.link_credential_id, NEW.link_evidence_ciphertext, NEW.ownership_verified_at)
    IS DISTINCT FROM (OLD.origin, OLD.link_credential_id, OLD.link_evidence_ciphertext, OLD.ownership_verified_at)
  THEN RAISE EXCEPTION 'Domain origin and linking evidence are immutable'; END IF;
  IF OLD.origin = 'EXISTING' AND NEW.provider_order_id IS DISTINCT FROM OLD.provider_order_id
  THEN RAISE EXCEPTION 'Linked registrar order identity is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER existing_domain_link_guard BEFORE UPDATE OR DELETE ON domains
  FOR EACH ROW EXECUTE FUNCTION existing_domain_link_guard();
CREATE FUNCTION existing_domain_registration_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM domains WHERE id = NEW.domain_id AND origin = 'EXISTING')
  THEN RAISE EXCEPTION 'Existing domains cannot enter registration'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER existing_domain_registration_guard BEFORE INSERT ON registrar_operations
  FOR EACH ROW EXECUTE FUNCTION existing_domain_registration_guard();
CREATE FUNCTION existing_domain_renewal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind = 'RENEW' AND EXISTS (SELECT 1 FROM domains WHERE id=NEW.domain_id AND origin='EXISTING')
  THEN RAISE EXCEPTION 'Linked domain renewal billing is not approved'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER existing_domain_renewal_guard BEFORE INSERT ON domain_actions
  FOR EACH ROW EXECUTE FUNCTION existing_domain_renewal_guard();
COMMIT;
