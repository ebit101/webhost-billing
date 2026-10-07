-- Empty additive complete snapshots. No selection pointer, defaults or backfill.
CREATE TABLE "currency_policy_revisions" (
  "revision" VARCHAR(64) NOT NULL,
  "policy" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "currency_policy_revisions_pkey" PRIMARY KEY ("revision"),
  CONSTRAINT "currency_policy_revisions_revision_check" CHECK (
    octet_length("revision") BETWEEN 1 AND 64
    AND "revision" COLLATE "C" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    AND "revision" COLLATE "C" !~ '[^A-Za-z0-9._:-]'
  ),
  CONSTRAINT "currency_policy_revisions_identity_check" CHECK (
    jsonb_typeof("policy") = 'object' AND "policy" ? 'revision'
    AND jsonb_typeof("policy"->'revision') = 'string'
    AND "policy"->>'revision' = "revision"
  )
);

CREATE FUNCTION currency_policy_reference_valid(value JSONB) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(value)) <> 2
    OR NOT (value ?& ARRAY['code','metadataVersion']) THEN RETURN false; END IF;
  RETURN COALESCE(
    jsonb_typeof(value->'code') = 'string'
    AND octet_length(value->>'code') = 3
    AND (value->>'code') COLLATE "C" ~ '^[A-Z]{3}$'
    AND (value->>'code') COLLATE "C" !~ '[^A-Z]'
    AND jsonb_typeof(value->'metadataVersion') = 'string'
    AND octet_length(value->>'metadataVersion') BETWEEN 1 AND 64
    AND (value->>'metadataVersion') COLLATE "C" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    AND (value->>'metadataVersion') COLLATE "C" !~ '[^A-Za-z0-9._:-]', false);
END;
$$;

CREATE FUNCTION validate_currency_policy_snapshot() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  entry JSONB;
  chosen JSONB;
  field TEXT;
  unit_status TEXT;
  seen_codes TEXT[] := ARRAY[]::TEXT[];
  keys_count INTEGER;
  reference_valid BOOLEAN;
BEGIN
  IF jsonb_typeof(NEW.policy) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid currency policy object' USING ERRCODE = '23514';
  END IF;
  SELECT count(*) INTO keys_count FROM jsonb_object_keys(NEW.policy);
  IF NOT (NEW.policy ?& ARRAY['revision','base','defaultBrowsing','currencies'])
    OR keys_count <> (CASE WHEN NEW.policy ? 'preferredSecondary' THEN 5 ELSE 4 END)
    OR jsonb_typeof(NEW.policy->'revision') IS DISTINCT FROM 'string'
    OR NEW.policy->>'revision' IS DISTINCT FROM NEW.revision THEN
    RAISE EXCEPTION 'Invalid currency policy fields' USING ERRCODE = '23514';
  END IF;
  IF jsonb_typeof(NEW.policy->'currencies') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid currency policy entries' USING ERRCODE = '23514';
  END IF;
  IF jsonb_array_length(NEW.policy->'currencies') NOT BETWEEN 1 AND 32 THEN
    RAISE EXCEPTION 'Currency policy entry budget exceeded' USING ERRCODE = '23514';
  END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(NEW.policy->'currencies') LOOP
    IF jsonb_typeof(entry) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid currency policy entry' USING ERRCODE = '23514';
    END IF;
    EXECUTE format('SELECT %I.currency_policy_reference_valid($1)', TG_TABLE_SCHEMA)
      INTO reference_valid USING entry->'unit';
    IF (SELECT count(*) FROM jsonb_object_keys(entry)) <> 2
      OR NOT (entry ?& ARRAY['unit','capabilities'])
      OR NOT reference_valid
      OR jsonb_typeof(entry->'capabilities') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid currency policy entry fields' USING ERRCODE = '23514';
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(entry->'capabilities')) <> 3
      OR NOT ((entry->'capabilities') ?& ARRAY['display','newSales','collection'])
      OR jsonb_typeof(entry#>'{capabilities,display}') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(entry#>'{capabilities,newSales}') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(entry#>'{capabilities,collection}') IS DISTINCT FROM 'boolean'
      OR (entry#>>'{unit,code}') = ANY(seen_codes) THEN
      RAISE EXCEPTION 'Invalid or duplicate currency capabilities' USING ERRCODE = '23514';
    END IF;
    seen_codes := array_append(seen_codes, entry#>>'{unit,code}');
    -- Pin lookup to the trigger's table schema, not a caller's search_path.
    EXECUTE format('SELECT status FROM %I.currency_unit_definitions WHERE code=$1 AND metadata_version=$2', TG_TABLE_SCHEMA)
      INTO unit_status USING entry#>>'{unit,code}', entry#>>'{unit,metadataVersion}';
    IF unit_status IS NULL OR (unit_status = 'historical' AND
      ((entry#>>'{capabilities,display}')::boolean OR (entry#>>'{capabilities,newSales}')::boolean)) THEN
      RAISE EXCEPTION 'Unavailable or ineligible currency unit context' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  FOREACH field IN ARRAY ARRAY['base','defaultBrowsing','preferredSecondary'] LOOP
    IF field = 'preferredSecondary' AND NOT (NEW.policy ? field) THEN CONTINUE; END IF;
    chosen := NEW.policy->field;
    EXECUTE format('SELECT %I.currency_policy_reference_valid($1)', TG_TABLE_SCHEMA)
      INTO reference_valid USING chosen;
    IF NOT reference_valid THEN
      RAISE EXCEPTION 'Invalid selected currency reference' USING ERRCODE = '23514';
    END IF;
    SELECT value INTO entry FROM jsonb_array_elements(NEW.policy->'currencies') WHERE value->'unit' = chosen;
    IF entry IS NULL THEN
      RAISE EXCEPTION 'Selected currency is not an exact entry' USING ERRCODE = '23514';
    END IF;
    IF field <> 'base' THEN
      EXECUTE format('SELECT status FROM %I.currency_unit_definitions WHERE code=$1 AND metadata_version=$2', TG_TABLE_SCHEMA)
        INTO unit_status USING chosen->>'code', chosen->>'metadataVersion';
      IF unit_status IS DISTINCT FROM 'current' OR NOT (entry#>>'{capabilities,display}')::boolean THEN
        RAISE EXCEPTION 'Browsing choice needs current display-enabled context' USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;
  IF NEW.policy ? 'preferredSecondary' AND
    NEW.policy#>>'{preferredSecondary,code}' = NEW.policy#>>'{defaultBrowsing,code}' THEN
    RAISE EXCEPTION 'Secondary must differ from default browsing currency' USING ERRCODE = '23514';
  END IF;
  NEW.policy := jsonb_set(NEW.policy, '{currencies}',
    (SELECT jsonb_agg(value ORDER BY (value#>>'{unit,code}') COLLATE "C")
      FROM jsonb_array_elements(NEW.policy->'currencies')));
  RETURN NEW;
END;
$$;

CREATE TRIGGER currency_policy_revisions_validate
BEFORE INSERT ON "currency_policy_revisions"
FOR EACH ROW EXECUTE FUNCTION validate_currency_policy_snapshot();

CREATE FUNCTION reject_currency_policy_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Currency policy revisions are immutable' USING ERRCODE = '23514';
END;
$$;

-- A snapshot has no extensible child rows. Reject even no-op/empty mutations.
-- Database owners can still disable/drop controls; no absolute immutability claim.
CREATE TRIGGER currency_policy_revisions_immutable
BEFORE UPDATE OR DELETE OR TRUNCATE ON "currency_policy_revisions"
FOR EACH STATEMENT EXECUTE FUNCTION reject_currency_policy_mutation();
