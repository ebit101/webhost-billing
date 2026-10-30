BEGIN;
-- Add a billing association without rewriting linked-domain or issued history.
CREATE TABLE existing_domain_orders (
 domain_id UUID PRIMARY KEY REFERENCES domains(id) ON DELETE RESTRICT,
 order_item_id UUID NOT NULL UNIQUE REFERENCES order_items(id) ON DELETE RESTRICT,
 invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
 customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX existing_domain_orders_customer_id_created_at_idx ON existing_domain_orders(customer_id,created_at);
CREATE FUNCTION existing_domain_order_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Existing domain billing history is immutable'; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM domains d JOIN order_items oi ON oi.id=NEW.order_item_id
  JOIN orders o ON o.id=oi.order_id JOIN invoices i ON i.id=NEW.invoice_id AND i.order_id=o.id
  JOIN invoice_items ii ON ii.invoice_id=i.id AND ii.order_item_id=oi.id
  WHERE d.id=NEW.domain_id AND d.origin='EXISTING' AND d.state='REGISTERED'
   AND d.customer_id=NEW.customer_id AND o.customer_id=NEW.customer_id AND i.customer_id=NEW.customer_id
   AND d.expires_at>CURRENT_TIMESTAMP AND d.ownership_verified_at IS NOT NULL
   AND oi.kind='DOMAIN' AND oi.requested_domain=d.domain_name AND oi.currency='BDT'
   AND oi.billing_period='ANNUAL' AND oi.quantity=1 AND oi.setup_fee=0 AND oi.unit_amount=oi.line_total
   AND oi.provisioning_snapshot->>'adminDomainAction'='EXISTING'
   AND oi.provisioning_snapshot->>'domainRecordId'=d.id::text
   AND oi.provisioning_snapshot->'sendToRegistrar'='false'::jsonb
   AND i.currency='BDT' AND ii.currency='BDT' AND ii.quantity=1 AND ii.line_total=oi.line_total
   AND i.total=(SELECT COALESCE(SUM(line_total),0) FROM invoice_items WHERE invoice_id=i.id)
 ) THEN RAISE EXCEPTION 'Existing domain order ownership or billing mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER existing_domain_order_guard BEFORE INSERT OR UPDATE OR DELETE ON existing_domain_orders
 FOR EACH ROW EXECUTE FUNCTION existing_domain_order_guard();

CREATE FUNCTION admin_domain_order_snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') AND coalesce(OLD.provisioning_snapshot ? 'adminDomainAction',false) THEN
  IF TG_OP='DELETE' OR NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Admin domain order snapshots are immutable'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND coalesce(NEW.provisioning_snapshot ? 'adminDomainAction',false)
  AND NOT coalesce(OLD.provisioning_snapshot ? 'adminDomainAction',false)
 THEN RAISE EXCEPTION 'Historical order items cannot be adopted'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER admin_domain_order_snapshot_guard BEFORE UPDATE OR DELETE ON order_items
 FOR EACH ROW EXECUTE FUNCTION admin_domain_order_snapshot_guard();

CREATE FUNCTION admin_domain_order_binding_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT coalesce(NEW.provisioning_snapshot ? 'adminDomainAction',false) THEN RETURN NEW; END IF;
 IF NEW.kind<>'DOMAIN' OR (
  (NEW.provisioning_snapshot->>'adminDomainAction'='EXISTING'
    AND NEW.provisioning_snapshot->'sendToRegistrar'='false'::jsonb
    AND EXISTS(SELECT 1 FROM existing_domain_orders e WHERE e.order_item_id=NEW.id
       AND e.domain_id::text=NEW.provisioning_snapshot->>'domainRecordId'))
  OR (NEW.provisioning_snapshot->>'adminDomainAction'='REGISTRATION'
    AND NEW.provisioning_snapshot->'sendToRegistrar'='true'::jsonb
    AND EXISTS(SELECT 1 FROM domains d WHERE d.order_item_id=NEW.id AND d.origin='REGISTRATION'
       AND d.id::text=NEW.provisioning_snapshot->>'domainRecordId'))
 ) IS NOT TRUE THEN RAISE EXCEPTION 'Admin domain order requires its matching domain association'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER admin_domain_order_binding_check AFTER INSERT ON order_items
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION admin_domain_order_binding_check();

CREATE OR REPLACE FUNCTION domain_order_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='COMPLETED' AND EXISTS (
  SELECT 1 FROM order_items oi LEFT JOIN domains d ON d.order_item_id=oi.id
  LEFT JOIN existing_domain_orders e ON e.order_item_id=oi.id LEFT JOIN domains linked ON linked.id=e.domain_id
  WHERE oi.order_id=OLD.id AND oi.kind='DOMAIN' AND
   NOT (coalesce(d.state='REGISTERED',false) OR coalesce(linked.origin='EXISTING' AND linked.state='REGISTERED',false))
 ) THEN RAISE EXCEPTION 'Domain requires confirmed registration or verified existing ownership'; END IF;
 IF NEW.status='COMPLETED' AND EXISTS (SELECT 1 FROM order_items oi LEFT JOIN services s ON s.order_item_id=oi.id WHERE oi.order_id=OLD.id AND oi.kind='HOSTING' AND (s.id IS NULL OR s.status<>'ACTIVE')) THEN RAISE EXCEPTION 'Hosting requires active service'; END IF;
 IF NEW.status IN ('CANCELLED','REJECTED','FAILED') AND EXISTS (SELECT 1 FROM domains d JOIN order_items oi ON oi.id=d.order_item_id JOIN registrar_operations op ON op.domain_id=d.id WHERE oi.order_id=OLD.id AND op.claimed_at IS NOT NULL) THEN RAISE EXCEPTION 'Claimed registration requires reconciliation'; END IF;
 RETURN NEW;
END $$;
COMMIT;
