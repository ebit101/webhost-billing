BEGIN;
-- Extend the format without changing or tagging any existing invoice line.
CREATE OR REPLACE FUNCTION invoice_product_attribution_shape(value jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT (jsonb_typeof(value)='object'
  AND jsonb_typeof(value->'productId')='string' AND value->>'productId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND jsonb_typeof(value->'name')='string' AND length(value->>'name') BETWEEN 1 AND 160
  AND (
   (value->'version'='1'::jsonb
    AND jsonb_typeof(value->'productPriceId')='string' AND value->>'productPriceId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND ((value->>'source' IN ('HOSTING_RENEWAL','HOSTING_PLAN_CHANGE') AND value->>'kind'='HOSTING')
      OR (value->>'source'='ADD_ON_RENEWAL' AND value->>'kind'='ADD_ON'))
    AND value-ARRAY['version','productId','productPriceId','name','kind','source']='{}'::jsonb)
   OR (value->'version'='2'::jsonb AND value->>'kind'='DOMAIN' AND value->>'source'='DOMAIN_RENEWAL'
    AND jsonb_typeof(value->'catalogueId')='string' AND value->>'catalogueId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND CASE WHEN jsonb_typeof(value->'catalogueRevision')='number' THEN
      (value->>'catalogueRevision')::numeric BETWEEN 1 AND 2147483647
      AND trunc((value->>'catalogueRevision')::numeric)=(value->>'catalogueRevision')::numeric ELSE false END
    AND value-ARRAY['version','productId','catalogueId','catalogueRevision','name','kind','source']='{}'::jsonb)
  )) IS TRUE
$$;

CREATE OR REPLACE FUNCTION protect_invoice_product_attribution() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE matches_source boolean; parent invoices%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.product_attribution_snapshot IS NOT NULL THEN RAISE EXCEPTION 'Attributed invoice history must be retained' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.product_attribution_snapshot IS DISTINCT FROM OLD.product_attribution_snapshot
    OR (OLD.product_attribution_snapshot IS NOT NULL AND NEW IS DISTINCT FROM OLD)
  THEN RAISE EXCEPTION 'Invoice product attribution and its issued line are immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.product_attribution_snapshot IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO parent FROM invoices WHERE id=NEW.invoice_id;
 IF parent.issued_at IS NULL OR parent.status='DRAFT' THEN RAISE EXCEPTION 'Capture product attribution only on issued lines' USING ERRCODE='23514'; END IF;
 IF parent.currency<>NEW.currency THEN RAISE EXCEPTION 'Invoice product attribution currency does not match its invoice' USING ERRCODE='23514'; END IF;
 CASE NEW.product_attribution_snapshot->>'source'
 WHEN 'HOSTING_RENEWAL' THEN
  SELECT EXISTS(SELECT 1 FROM services s WHERE s.id=NEW.service_id AND s.customer_id=parent.customer_id
    AND s.currency=NEW.currency AND s.product_id::text=NEW.product_attribution_snapshot->>'productId'
    AND s.product_price_id::text=NEW.product_attribution_snapshot->>'productPriceId'
    AND s.product_name_snapshot=NEW.product_attribution_snapshot->>'name'
    AND NEW.service_period_start IS NOT NULL AND NEW.service_period_end IS NOT NULL) INTO matches_source;
 WHEN 'ADD_ON_RENEWAL' THEN
  SELECT EXISTS(SELECT 1 FROM order_items a JOIN orders o ON o.id=a.order_id
    WHERE a.id=NEW.order_item_id AND a.kind='ADD_ON' AND o.customer_id=parent.customer_id AND a.currency=NEW.currency
    AND a.product_id::text=NEW.product_attribution_snapshot->>'productId'
    AND a.product_price_id::text=NEW.product_attribution_snapshot->>'productPriceId'
    AND a.product_name_snapshot=NEW.product_attribution_snapshot->>'name'
    AND NEW.service_period_start IS NOT NULL AND NEW.service_period_end IS NOT NULL) INTO matches_source;
 WHEN 'HOSTING_PLAN_CHANGE' THEN
  SELECT EXISTS(SELECT 1 FROM service_upgrades u JOIN services s ON s.id=u.service_id
    WHERE u.service_id=NEW.service_id AND s.customer_id=parent.customer_id AND s.currency=NEW.currency
    AND parent.submission_key='hosting-upgrade:' || u.id::text
    AND u.quote->'target'->>'productId'=NEW.product_attribution_snapshot->>'productId'
    AND u.quote->'target'->>'priceId'=NEW.product_attribution_snapshot->>'productPriceId'
    AND u.quote->'target'->>'name'=NEW.product_attribution_snapshot->>'name') INTO matches_source;
 WHEN 'DOMAIN_RENEWAL' THEN
  -- The retained renewal record is inserted after its invoice line. Its binding
  -- is mandatory at commit through the deferred constraint trigger below.
  matches_source:=true;
 ELSE matches_source:=false;
 END CASE;
 IF NOT coalesce(matches_source,false) THEN RAISE EXCEPTION 'Invoice product attribution does not match its source' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION bind_domain_invoice_attribution() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM domain_renewal_invoices r
   JOIN domains d ON d.id=r.domain_id AND d.customer_id=r.customer_id
   JOIN invoices i ON i.id=r.invoice_id AND i.customer_id=r.customer_id
   JOIN domain_renewal_preferences pref ON pref.domain_id=d.id AND pref.enabled
   JOIN domain_catalogue_tlds c ON c.id::text=NEW.product_attribution_snapshot->>'catalogueId'
   JOIN products p ON p.id=c.product_id AND p.kind='DOMAIN'
  WHERE r.invoice_id=NEW.invoice_id AND NEW.service_id IS NULL AND NEW.order_item_id IS NULL
   AND NEW.line_position=1 AND NEW.quantity=1 AND NEW.tax_amount=0 AND NEW.discount_amount=0
   AND NEW.currency='BDT' AND i.currency=NEW.currency AND i.issued_at IS NOT NULL AND i.status<>'DRAFT'
   AND NEW.unit_amount=NEW.line_total AND NEW.line_total=i.total
   AND NEW.line_total::text=r.terms_snapshot->>'amount' AND r.terms_snapshot->>'currency'=NEW.currency
   AND r.years=1 AND r.terms_snapshot->>'years'='1'
   AND d.expires_at=r.term_start AND r.term_start=NEW.service_period_start AND r.term_end=NEW.service_period_end
   AND r.terms_snapshot->'productAttribution'=NEW.product_attribution_snapshot
   AND pref.terms->'productAttribution'=NEW.product_attribution_snapshot
   AND pref.terms->>'amount'=r.terms_snapshot->>'amount'
   AND pref.terms->>'bindingHash'=r.terms_snapshot->>'bindingHash'
   AND c.product_id::text=NEW.product_attribution_snapshot->>'productId'
   AND c.revision::text=NEW.product_attribution_snapshot->>'catalogueRevision'
   AND c.revision::text=r.terms_snapshot->>'catalogueRevision'
   AND c.renewal_amount=NEW.line_total
 ) THEN RAISE EXCEPTION 'Domain invoice attribution does not match confirmed renewal terms' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER bind_domain_invoice_attribution AFTER INSERT ON invoice_items
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 WHEN (NEW.product_attribution_snapshot->>'source'='DOMAIN_RENEWAL')
 EXECUTE FUNCTION bind_domain_invoice_attribution();
COMMIT;
