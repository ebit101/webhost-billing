-- A domain registration may share an immutable invoice with one hosting item.
-- The domain quote must match its own order and invoice line; the invoice must
-- still equal the sum of every snapshotted line.
CREATE OR REPLACE FUNCTION domain_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Domain history cannot be deleted'; END IF;
 IF TG_OP = 'UPDATE' AND (NEW.id,NEW.quote_id,NEW.customer_id,NEW.account_id,NEW.invoice_id,NEW.order_item_id,NEW.domain_name,NEW.submission_key,NEW.created_at) IS DISTINCT FROM
 (OLD.id,OLD.quote_id,OLD.customer_id,OLD.account_id,OLD.invoice_id,OLD.order_item_id,OLD.domain_name,OLD.submission_key,OLD.created_at) THEN RAISE EXCEPTION 'Domain identity is immutable'; END IF;
 IF NOT EXISTS (
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
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION domain_order_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='COMPLETED' AND EXISTS (SELECT 1 FROM domains d JOIN order_items oi ON oi.id=d.order_item_id WHERE oi.order_id=OLD.id AND d.state<>'REGISTERED') THEN RAISE EXCEPTION 'Domain requires confirmed registration'; END IF;
 IF NEW.status='COMPLETED' AND EXISTS (SELECT 1 FROM order_items oi LEFT JOIN services s ON s.order_item_id=oi.id WHERE oi.order_id=OLD.id AND oi.kind='HOSTING' AND (s.id IS NULL OR s.status<>'ACTIVE')) THEN RAISE EXCEPTION 'Hosting requires active service'; END IF;
 IF NEW.status IN ('CANCELLED','REJECTED','FAILED') AND EXISTS (SELECT 1 FROM domains d JOIN order_items oi ON oi.id=d.order_item_id JOIN registrar_operations op ON op.domain_id=d.id WHERE oi.order_id=OLD.id AND op.claimed_at IS NOT NULL) THEN RAISE EXCEPTION 'Claimed registration requires reconciliation'; END IF;
 RETURN NEW;
END $$;
