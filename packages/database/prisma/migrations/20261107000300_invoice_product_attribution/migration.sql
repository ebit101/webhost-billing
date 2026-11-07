BEGIN;
-- Nullable by design: historical and ad-hoc lines retain their original evidence.
-- Do not backfill from mutable service or catalogue state.
ALTER TABLE invoice_items ADD COLUMN product_attribution_snapshot JSONB;
CREATE FUNCTION invoice_product_attribution_shape(value jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT (jsonb_typeof(value)='object'
  AND value->'version'='1'::jsonb
  AND jsonb_typeof(value->'productId')='string' AND value->>'productId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND jsonb_typeof(value->'productPriceId')='string' AND value->>'productPriceId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND jsonb_typeof(value->'name')='string' AND length(value->>'name') BETWEEN 1 AND 160
  AND ((value->>'source' IN ('HOSTING_RENEWAL','HOSTING_PLAN_CHANGE') AND value->>'kind'='HOSTING')
    OR (value->>'source'='ADD_ON_RENEWAL' AND value->>'kind'='ADD_ON'))
  AND value-ARRAY['version','productId','productPriceId','name','kind','source']='{}'::jsonb) IS TRUE
$$;
ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_product_attribution_shape
 CHECK(product_attribution_snapshot IS NULL OR invoice_product_attribution_shape(product_attribution_snapshot));

CREATE FUNCTION protect_invoice_product_attribution() RETURNS trigger LANGUAGE plpgsql AS $$
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
 ELSE matches_source:=false;
 END CASE;
 IF NOT coalesce(matches_source,false) THEN RAISE EXCEPTION 'Invoice product attribution does not match its source' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_invoice_product_attribution BEFORE INSERT OR UPDATE OR DELETE ON invoice_items
 FOR EACH ROW EXECUTE FUNCTION protect_invoice_product_attribution();
COMMIT;
