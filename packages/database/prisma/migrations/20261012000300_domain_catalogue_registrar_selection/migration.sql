BEGIN;
-- Existing account configurations, offers, quotes and money rows are not rewritten.
DROP INDEX registrar_single_live_account;
DROP INDEX domain_offers_product_id_key;
DROP INDEX domain_offers_price_id_key;
CREATE TABLE registrar_profiles (
 account_id UUID PRIMARY KEY REFERENCES registrar_accounts(id) ON DELETE RESTRICT,
 name VARCHAR(100) NOT NULL CHECK(length(trim(name)) > 0),
 is_default BOOLEAN NOT NULL DEFAULT false,
 native_cost_confirmed BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX registrar_one_default ON registrar_profiles(is_default) WHERE is_default;
CREATE TABLE domain_catalogue_tlds (
 id UUID PRIMARY KEY, tld VARCHAR(50) NOT NULL UNIQUE CHECK(tld ~ '^[a-z]{2,24}(\.[a-z]{2,24})?$'),
 product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 registration_price_id UUID REFERENCES product_prices(id) ON DELETE RESTRICT,
 renewal_amount BIGINT CHECK(renewal_amount > 0 AND renewal_amount <= 999999999999999),
 preferred_registrar_id UUID REFERENCES registrar_accounts(id) ON DELETE RESTRICT,
 enabled BOOLEAN NOT NULL DEFAULT false, featured BOOLEAN NOT NULL DEFAULT false,
 display_order INTEGER NOT NULL DEFAULT 0 CHECK(display_order BETWEEN 0 AND 10000),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
 CHECK(NOT enabled OR (tld='com' AND registration_price_id IS NOT NULL))
);
ALTER TABLE domain_quotes ADD COLUMN selection_snapshot JSONB;
ALTER TABLE domains ADD COLUMN execution_account_id UUID REFERENCES registrar_accounts(id) ON DELETE RESTRICT;
ALTER TABLE registrar_operations ADD COLUMN selected_account_id UUID REFERENCES registrar_accounts(id) ON DELETE RESTRICT;
ALTER TABLE registrar_operations ADD COLUMN selected_credential_id UUID;
ALTER TABLE registrar_operations ADD COLUMN selection_fingerprint CHAR(64);
ALTER TABLE registrar_operations ADD FOREIGN KEY(selected_credential_id,selected_account_id) REFERENCES registrar_credentials(id,account_id) ON DELETE RESTRICT;
ALTER TABLE registrar_operations ADD CONSTRAINT registrar_selection_complete CHECK (
 (selected_account_id IS NULL AND selected_credential_id IS NULL AND selection_fingerprint IS NULL) OR
 (selected_account_id IS NOT NULL AND selected_credential_id IS NOT NULL AND selection_fingerprint IS NOT NULL AND selection_fingerprint ~ '^[a-f0-9]{64}$')
);
DROP INDEX domains_account_id_provider_order_id_key;
CREATE UNIQUE INDEX domains_account_id_provider_order_id_key ON domains(account_id,provider_order_id) WHERE execution_account_id IS NULL;
CREATE INDEX domains_account_id_provider_order_id_idx ON domains(account_id,provider_order_id);
CREATE UNIQUE INDEX domains_execution_account_id_provider_order_id_key ON domains(execution_account_id,provider_order_id);
-- Legacy and new domains share the same upstream order namespace per actual account.
CREATE UNIQUE INDEX domains_actual_account_provider_order_key ON domains(COALESCE(execution_account_id,account_id),provider_order_id);

CREATE FUNCTION registrar_profile_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND NEW.account_id IS DISTINCT FROM OLD.account_id) THEN
  RAISE EXCEPTION 'Registrar connection identity is retained';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER registrar_profile_guard BEFORE UPDATE OR DELETE ON registrar_profiles FOR EACH ROW EXECUTE FUNCTION registrar_profile_guard();

CREATE FUNCTION domain_catalogue_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND (
  (NEW.id,NEW.tld,NEW.product_id) IS DISTINCT FROM (OLD.id,OLD.tld,OLD.product_id) OR NEW.revision <> OLD.revision+1
 )) THEN RAISE EXCEPTION 'Catalogue identity is retained and edits require a new revision'; END IF;
 IF NOT EXISTS(SELECT 1 FROM products p WHERE p.id=NEW.product_id AND p.kind='DOMAIN') THEN
  RAISE EXCEPTION 'Domain catalogue requires a domain product';
 END IF;
 IF NEW.registration_price_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM product_prices p
  WHERE p.id=NEW.registration_price_id AND p.product_id=NEW.product_id AND p.currency='BDT'
   AND p.billing_period='ANNUAL' AND p.amount > 0 AND p.setup_fee=0 AND NOT p.is_active) THEN
  RAISE EXCEPTION 'Domain catalogue price is invalid';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER domain_catalogue_guard BEFORE INSERT OR UPDATE OR DELETE ON domain_catalogue_tlds FOR EACH ROW EXECUTE FUNCTION domain_catalogue_guard();

CREATE FUNCTION domain_catalogue_price_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM domain_catalogue_tlds WHERE product_id=OLD.product_id) THEN
  RAISE EXCEPTION 'Domain catalogue price versions are immutable';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER domain_catalogue_price_guard BEFORE UPDATE OR DELETE ON product_prices FOR EACH ROW EXECUTE FUNCTION domain_catalogue_price_guard();

CREATE FUNCTION domain_quote_selection_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.selection_snapshot IS NOT NULL THEN
  IF NEW.selection_snapshot->>'schemaVersion' IS DISTINCT FROM '1' OR
    NOT EXISTS(SELECT 1 FROM domain_catalogue_tlds c JOIN product_prices p ON p.id=c.registration_price_id
     WHERE c.id=(NEW.selection_snapshot->>'catalogueId')::uuid AND c.revision=(NEW.selection_snapshot->>'catalogueRevision')::integer
      AND c.enabled AND c.tld='com' AND p.id=(NEW.selection_snapshot->>'priceId')::uuid AND p.amount=NEW.selling_amount
      AND p.currency='BDT' AND p.product_id=c.product_id) OR
    jsonb_typeof(NEW.selection_snapshot->'eligibleRegistrars') IS DISTINCT FROM 'array' OR
    NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.selection_snapshot->'eligibleRegistrars') e WHERE e->>'id'=NEW.account_id::text) THEN
   RAISE EXCEPTION 'Quote selection snapshot does not match the reviewed catalogue';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER domain_quote_selection_guard BEFORE INSERT ON domain_quotes FOR EACH ROW EXECUTE FUNCTION domain_quote_selection_guard();

CREATE FUNCTION registrar_selection_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE snapshot JSONB;
BEGIN
 SELECT q.selection_snapshot INTO snapshot FROM domains d JOIN domain_quotes q ON q.id=d.quote_id WHERE d.id=NEW.domain_id;
 IF snapshot IS NOT NULL AND NEW.selected_account_id IS NULL THEN
  RAISE EXCEPTION 'A catalogue quote requires explicit registrar selection';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.selected_account_id,NEW.selected_credential_id,NEW.selection_fingerprint)
   IS DISTINCT FROM (OLD.selected_account_id,OLD.selected_credential_id,OLD.selection_fingerprint) THEN
  RAISE EXCEPTION 'Approved registrar selection is immutable';
 END IF;
 IF NEW.selected_account_id IS NOT NULL THEN
  IF snapshot IS NULL OR snapshot->>'schemaVersion' <> '1' OR jsonb_typeof(snapshot->'eligibleRegistrars') <> 'array'
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'eligibleRegistrars') e WHERE e->>'id'=NEW.selected_account_id::text)
   OR NOT EXISTS(SELECT 1 FROM registrar_accounts a JOIN registrar_accounts origin ON origin.id=NEW.account_id
     WHERE a.id=NEW.selected_account_id AND a.mode=origin.mode AND a.provider=origin.provider) THEN
   RAISE EXCEPTION 'Selected registrar is outside the customer consent scope';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER registrar_selection_guard BEFORE INSERT OR UPDATE ON registrar_operations FOR EACH ROW EXECUTE FUNCTION registrar_selection_guard();

CREATE FUNCTION domain_execution_account_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' AND NEW.execution_account_id IS NOT NULL THEN
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
CREATE TRIGGER domain_execution_account_guard BEFORE INSERT OR UPDATE ON domains FOR EACH ROW EXECUTE FUNCTION domain_execution_account_guard();

-- Quote provenance is retained; subsequent management belongs to the executed account.
ALTER TABLE domain_actions DROP CONSTRAINT domain_actions_domain_id_customer_id_account_id_fkey;
ALTER TABLE domain_actions ADD FOREIGN KEY(domain_id) REFERENCES domains(id) ON DELETE RESTRICT;
CREATE FUNCTION domain_action_execution_owner_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM domains d WHERE d.id=NEW.domain_id AND d.customer_id=NEW.customer_id
  AND COALESCE(d.execution_account_id,d.account_id)=NEW.account_id) THEN
  RAISE EXCEPTION 'Domain action must use the executed registrar and owning customer';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER domain_action_execution_owner_guard BEFORE INSERT OR UPDATE ON domain_actions FOR EACH ROW EXECUTE FUNCTION domain_action_execution_owner_guard();

CREATE OR REPLACE FUNCTION registrar_preparation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
 IF NOT EXISTS(SELECT 1 FROM registrar_operations op JOIN registrar_accounts a ON a.id=COALESCE(op.selected_account_id,op.account_id)
  WHERE op.id=NEW.operation_id AND COALESCE(op.selected_account_id,op.account_id)=NEW.account_id AND op.customer_id=NEW.customer_id
  AND op.claimed_at IS NOT NULL AND a.mode='LIVE') THEN
  RAISE EXCEPTION 'Registrar preparation requires a claimed live operation';
 END IF;
 RETURN NEW;
END $$;
COMMIT;
