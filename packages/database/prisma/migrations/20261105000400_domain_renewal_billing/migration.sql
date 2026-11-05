BEGIN;
CREATE TABLE domain_renewal_preferences (
 domain_id UUID PRIMARY KEY REFERENCES domains(id) ON DELETE RESTRICT,
 enabled BOOLEAN NOT NULL DEFAULT false, revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 terms JSONB, review_code VARCHAR(64), updated_at TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT domain_renewal_preferences_shape CHECK (
  (terms IS NULL OR (jsonb_typeof(terms)='object' AND terms ?& ARRAY['schemaVersion','years','currency','amount','catalogueRevision','bindingHash']
    AND terms->>'schemaVersion'='1' AND terms->>'years'='1' AND terms->>'currency'='BDT'
    AND terms->>'amount' ~ '^[1-9][0-9]{0,14}$' AND terms->>'bindingHash' ~ '^[a-f0-9]{64}$'))
  AND (NOT enabled OR terms IS NOT NULL)
  AND (review_code IS NULL OR review_code ~ '^[A-Z_]{1,64}$')
 )
);
CREATE TABLE domain_renewal_invoices (
 id UUID PRIMARY KEY, domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE RESTRICT,
 customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 invoice_id UUID NOT NULL UNIQUE REFERENCES invoices(id) ON DELETE RESTRICT,
 source_fact_id UUID NOT NULL REFERENCES domain_fact_syncs(id) ON DELETE RESTRICT,
 term_start TIMESTAMPTZ(3) NOT NULL, term_end TIMESTAMPTZ(3) NOT NULL,
 years INTEGER NOT NULL DEFAULT 1 CHECK(years=1), terms_snapshot JSONB NOT NULL,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT domain_renewal_invoices_term_check CHECK(isfinite(term_start) AND isfinite(term_end) AND term_end>term_start AND jsonb_typeof(terms_snapshot)='object'),
 UNIQUE(domain_id,term_start,years)
);
CREATE FUNCTION domain_renewal_invoice_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Domain renewal billing history is immutable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM domains d JOIN invoices i ON i.id=NEW.invoice_id
   JOIN domain_fact_syncs f ON f.id=NEW.source_fact_id
   WHERE d.id=NEW.domain_id AND d.customer_id=NEW.customer_id AND i.customer_id=d.customer_id
   AND f.domain_id=d.id AND f.customer_id=d.customer_id AND f.status='SUCCEEDED' AND f.applied_at IS NOT NULL
   AND i.currency='BDT' AND i.issued_at IS NOT NULL AND i.total>0 AND i.total::text=NEW.terms_snapshot->>'amount'
   AND EXISTS(SELECT 1 FROM invoice_items ii WHERE ii.invoice_id=i.id AND ii.line_position=1 AND ii.service_id IS NULL
     AND ii.currency=i.currency AND ii.line_total=i.total AND ii.service_period_start=NEW.term_start AND ii.service_period_end=NEW.term_end)
 ) THEN RAISE EXCEPTION 'Domain renewal billing ownership or snapshot mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER domain_renewal_billing_history BEFORE INSERT OR UPDATE OR DELETE ON domain_renewal_invoices FOR EACH ROW EXECUTE FUNCTION domain_renewal_invoice_guard();
COMMIT;
