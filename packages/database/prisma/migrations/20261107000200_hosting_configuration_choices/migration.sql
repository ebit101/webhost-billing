BEGIN;
CREATE FUNCTION hosting_option_shape(value jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT (jsonb_typeof(value)='object'
  AND value->'version'='1'::jsonb
  AND jsonb_typeof(value->'groupKey')='string' AND value->>'groupKey' ~ '^[a-z][a-z0-9-]{0,39}$'
  AND jsonb_typeof(value->'groupName')='string' AND length(value->>'groupName') BETWEEN 1 AND 60
  AND jsonb_typeof(value->'choiceName')='string' AND length(value->>'choiceName') BETWEEN 1 AND 60
  AND value->>'fulfillment'='MANUAL'
  AND jsonb_typeof(value->'fulfillmentNote')='string' AND length(value->>'fulfillmentNote') BETWEEN 1 AND 500
  AND value - ARRAY['version','groupKey','groupName','choiceName','fulfillment','fulfillmentNote']='{}'::jsonb) IS TRUE
$$;
ALTER TABLE products ADD CONSTRAINT product_hosting_option_shape CHECK (
 NOT coalesce(provisioning_config ? 'hostingOption',false)
 OR provisioning_config->'hostingOption'='null'::jsonb
 OR (kind='ADD_ON' AND hosting_option_shape(provisioning_config->'hostingOption')) IS TRUE
);
ALTER TABLE order_items ADD CONSTRAINT order_hosting_option_shape CHECK (
 NOT coalesce(provisioning_snapshot ? 'hostingOption',false)
 OR (kind='ADD_ON' AND quantity=1 AND setup_fee=0 AND unit_amount=line_total
     AND hosting_option_shape(provisioning_snapshot->'hostingOption')) IS TRUE
);
CREATE UNIQUE INDEX order_hosting_option_group_unique ON order_items
 (order_id,(provisioning_snapshot->'hostingOption'->>'groupKey'))
 WHERE coalesce(provisioning_snapshot ? 'hostingOption',false);
CREATE FUNCTION protect_hosting_option_purchase() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF coalesce(OLD.provisioning_snapshot ? 'hostingOption',false) THEN
   RAISE EXCEPTION 'Hosting configuration purchases must be retained' USING ERRCODE='23514';
  END IF;
  RETURN OLD;
 END IF;
 IF coalesce(OLD.provisioning_snapshot ? 'hostingOption',false)
   OR coalesce(NEW.provisioning_snapshot ? 'hostingOption',false) THEN
  IF (NEW.order_id,NEW.kind,NEW.product_id,NEW.product_price_id,NEW.product_name_snapshot,
      NEW.description_snapshot,NEW.billing_period,NEW.currency,NEW.unit_amount,NEW.setup_fee,
      NEW.quantity,NEW.line_total,NEW.requested_domain,NEW.provisioning_snapshot)
   IS DISTINCT FROM
     (OLD.order_id,OLD.kind,OLD.product_id,OLD.product_price_id,OLD.product_name_snapshot,
      OLD.description_snapshot,OLD.billing_period,OLD.currency,OLD.unit_amount,OLD.setup_fee,
      OLD.quantity,OLD.line_total,OLD.requested_domain,OLD.provisioning_snapshot)
  THEN RAISE EXCEPTION 'Hosting configuration purchase snapshots are immutable' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_hosting_option_purchase BEFORE UPDATE OR DELETE ON order_items
 FOR EACH ROW EXECUTE FUNCTION protect_hosting_option_purchase();
COMMIT;
