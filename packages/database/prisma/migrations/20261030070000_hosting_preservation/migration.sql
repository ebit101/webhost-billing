-- Preserve historical JSON unchanged; pin only explicitly selected new modes.
BEGIN;
ALTER TABLE order_items ADD CONSTRAINT order_hosting_mode_valid CHECK (
 NOT coalesce(provisioning_snapshot ? 'hostingProvisioningMode', false)
 OR (jsonb_typeof(provisioning_snapshot->'hostingProvisioningMode')='string'
 AND provisioning_snapshot->>'hostingProvisioningMode' IN ('STANDARD','PRESERVE_EXISTING')) IS TRUE
);
ALTER TABLE services ADD CONSTRAINT service_hosting_mode_valid CHECK (
 NOT coalesce(provisioning_snapshot ? 'hostingProvisioningMode', false)
 OR (jsonb_typeof(provisioning_snapshot->'hostingProvisioningMode')='string'
 AND provisioning_snapshot->>'hostingProvisioningMode' IN ('STANDARD','PRESERVE_EXISTING')) IS TRUE
);
CREATE FUNCTION protect_hosting_provisioning_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_snapshot jsonb;
BEGIN
 IF TG_OP='UPDATE' AND (coalesce(OLD.provisioning_snapshot ? 'hostingProvisioningMode',false)
   OR coalesce(NEW.provisioning_snapshot ? 'hostingProvisioningMode',false)) THEN
   IF NEW.provisioning_snapshot IS DISTINCT FROM OLD.provisioning_snapshot THEN
     RAISE EXCEPTION 'Hosting provisioning snapshot is immutable' USING ERRCODE='23514';
   END IF;
   IF TG_TABLE_NAME='services' THEN
     IF NEW.order_item_id IS DISTINCT FROM OLD.order_item_id THEN
       RAISE EXCEPTION 'Hosting provisioning order identity is immutable' USING ERRCODE='23514';
     END IF;
   END IF;
 END IF;
 IF TG_TABLE_NAME='services' THEN
   EXECUTE format('SELECT provisioning_snapshot FROM %I.order_items WHERE id=$1',TG_TABLE_SCHEMA)
     INTO source_snapshot USING NEW.order_item_id;
   IF coalesce(NEW.provisioning_snapshot ? 'hostingProvisioningMode',false)
     OR coalesce(source_snapshot ? 'hostingProvisioningMode',false) THEN
     IF source_snapshot IS DISTINCT FROM NEW.provisioning_snapshot THEN
       RAISE EXCEPTION 'Service must retain the order provisioning snapshot' USING ERRCODE='23514';
     END IF;
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER order_hosting_snapshot_guard BEFORE UPDATE ON order_items FOR EACH ROW EXECUTE FUNCTION protect_hosting_provisioning_snapshot();
CREATE TRIGGER service_hosting_snapshot_guard BEFORE INSERT OR UPDATE ON services FOR EACH ROW EXECUTE FUNCTION protect_hosting_provisioning_snapshot();
COMMIT;
