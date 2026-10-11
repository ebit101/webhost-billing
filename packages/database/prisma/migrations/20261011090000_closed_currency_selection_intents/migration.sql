-- Closed empty storage only. No reservation, issuer, proof, receipt or selection.
BEGIN;

ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_id_user_id_key" UNIQUE ("id", "user_id");

-- One bounded scalar S reconstruction shared by CHECKs. It never reads product data.
CREATE FUNCTION currency_selection_intent_canonical(
  installation_uuid pg_catalog.uuid, domain_uuid pg_catalog.uuid,
  actor_uuid pg_catalog.uuid, session_uuid pg_catalog.uuid,
  key_text pg_catalog.text, operation pg_catalog.text, prior_revision pg_catalog.text,
  generation pg_catalog.int8, next_revision pg_catalog.text
) RETURNS pg_catalog.text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE u pg_catalog.uuid; value pg_catalog.text; result pg_catalog.text;
BEGIN
  IF installation_uuid IS NULL OR domain_uuid IS NULL OR actor_uuid IS NULL OR session_uuid IS NULL
    OR key_text IS NULL OR operation IS NULL OR generation IS NULL OR next_revision IS NULL THEN RETURN NULL; END IF;
  -- Typed UUID output is lowercase; no input identity normalization or acquisition.
  FOREACH u IN ARRAY ARRAY[installation_uuid,domain_uuid,actor_uuid,session_uuid] LOOP
    value := u::pg_catalog.text;
    IF value NOT IN ('00000000-0000-0000-0000-000000000000','ffffffff-ffff-ffff-ffff-ffffffffffff')
      AND value COLLATE "C" !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RETURN NULL; END IF;
  END LOOP;
  IF pg_catalog.octet_length(key_text) <> 36 THEN RETURN NULL; END IF;
  IF key_text NOT IN ('00000000-0000-0000-0000-000000000000','ffffffff-ffff-ffff-ffff-ffffffffffff')
    AND key_text COLLATE "C" !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN RETURN NULL; END IF;
  IF pg_catalog.octet_length(next_revision) NOT BETWEEN 1 AND 64
    OR next_revision COLLATE "C" !~ '^[A-Za-z0-9]' OR next_revision COLLATE "C" ~ '[^A-Za-z0-9._:-]' THEN RETURN NULL; END IF;
  IF prior_revision IS NOT NULL AND (pg_catalog.octet_length(prior_revision) NOT BETWEEN 1 AND 64
    OR prior_revision COLLATE "C" !~ '^[A-Za-z0-9]' OR prior_revision COLLATE "C" ~ '[^A-Za-z0-9._:-]') THEN RETURN NULL; END IF;
  IF operation IN ('initialize','adopt') THEN
    IF prior_revision IS NOT NULL OR generation <> 0 THEN RETURN NULL; END IF;
  ELSIF operation = 'replace' THEN
    IF prior_revision IS NULL OR generation <= 0 OR prior_revision = next_revision THEN RETURN NULL; END IF;
  ELSE RETURN NULL; END IF;
  -- Every text is now bounded ASCII with no quote/backslash; only fixed grammar is serialized.
  result := '["currency-selection-request-v1",["'||installation_uuid::pg_catalog.text||'","'||domain_uuid::pg_catalog.text
    ||'"],"'||operation||'","'||actor_uuid::pg_catalog.text||'","'||session_uuid::pg_catalog.text||'","'||key_text||'",'
    ||CASE WHEN prior_revision IS NULL THEN 'null' ELSE '"'||prior_revision||'"' END
    ||',"'||generation::pg_catalog.text||'","'||next_revision||'"]';
  IF pg_catalog.octet_length(result) > 1024 THEN RETURN NULL; END IF;
  RETURN result;
END;
$$;

CREATE TABLE "currency_selection_intents" (
  "installation_id" UUID NOT NULL,
  "request_key_uuid" UUID NOT NULL,
  "execution_domain_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "request_key_text" TEXT COLLATE pg_catalog."C" NOT NULL,
  "action" VARCHAR(10) COLLATE pg_catalog."C" NOT NULL,
  "expected_revision" VARCHAR(64) COLLATE pg_catalog."C",
  "expected_generation" BIGINT NOT NULL,
  "proposed_revision" VARCHAR(64) COLLATE pg_catalog."C" NOT NULL,
  "canonical_text" TEXT COLLATE pg_catalog."C" NOT NULL,
  "stable_intent_digest" VARCHAR(64) COLLATE pg_catalog."C" NOT NULL,
  CONSTRAINT "currency_selection_intents_pkey" PRIMARY KEY ("installation_id", "request_key_uuid"),
  CONSTRAINT "currency_selection_intents_installation_fkey" FOREIGN KEY ("installation_id")
    REFERENCES "currency_installations"("installation_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "currency_selection_intents_domain_fkey" FOREIGN KEY ("installation_id", "execution_domain_id")
    REFERENCES "currency_execution_domains"("installation_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "currency_selection_intents_actor_fkey" FOREIGN KEY ("actor_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "currency_selection_intents_session_owner_fkey" FOREIGN KEY ("session_id", "actor_user_id")
    REFERENCES "auth_sessions"("id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "currency_selection_intents_expected_policy_fkey" FOREIGN KEY ("expected_revision")
    REFERENCES "currency_policy_revisions"("revision") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "currency_selection_intents_proposed_policy_fkey" FOREIGN KEY ("proposed_revision")
    REFERENCES "currency_policy_revisions"("revision") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "currency_selection_intents_key_check" CHECK (CASE
    WHEN currency_selection_intent_canonical("installation_id","execution_domain_id","actor_user_id","session_id",
      "request_key_text","action","expected_revision","expected_generation","proposed_revision") IS NOT NULL
    THEN "request_key_text"::pg_catalog.uuid = "request_key_uuid" ELSE false END),
  CONSTRAINT "currency_selection_intents_canonical_check" CHECK (CASE
    WHEN pg_catalog.octet_length("canonical_text") BETWEEN 1 AND 1024
    THEN COALESCE(pg_catalog.convert_to("canonical_text",'UTF8') = pg_catalog.convert_to(
      currency_selection_intent_canonical("installation_id","execution_domain_id","actor_user_id","session_id",
        "request_key_text","action","expected_revision","expected_generation","proposed_revision"),'UTF8'),false)
    ELSE false END),
  CONSTRAINT "currency_selection_intents_digest_check" CHECK (
    pg_catalog.octet_length("stable_intent_digest") = 64 AND "stable_intent_digest" !~ '[^a-f0-9]'
    AND COALESCE("stable_intent_digest" = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      currency_selection_intent_canonical("installation_id","execution_domain_id","actor_user_id","session_id",
        "request_key_text","action","expected_revision","expected_generation","proposed_revision"),'UTF8')),'hex'),false)
  )
);

CREATE FUNCTION deny_currency_selection_intent_mutation() RETURNS pg_catalog.trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Closed currency selection intent mutation denied.';
END;
$$;

CREATE TRIGGER "currency_selection_intents_no_insert" BEFORE INSERT ON "currency_selection_intents"
FOR EACH STATEMENT EXECUTE FUNCTION deny_currency_selection_intent_mutation();
CREATE TRIGGER "currency_selection_intents_no_update" BEFORE UPDATE ON "currency_selection_intents"
FOR EACH STATEMENT EXECUTE FUNCTION deny_currency_selection_intent_mutation();
CREATE TRIGGER "currency_selection_intents_no_delete" BEFORE DELETE ON "currency_selection_intents"
FOR EACH STATEMENT EXECUTE FUNCTION deny_currency_selection_intent_mutation();
CREATE TRIGGER "currency_selection_intents_no_truncate" BEFORE TRUNCATE ON "currency_selection_intents"
FOR EACH STATEMENT EXECUTE FUNCTION deny_currency_selection_intent_mutation();

REVOKE ALL ON TABLE "currency_selection_intents" FROM PUBLIC;
REVOKE ALL ON FUNCTION currency_selection_intent_canonical(uuid,uuid,uuid,uuid,text,text,text,bigint,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION deny_currency_selection_intent_mutation() FROM PUBLIC;

COMMIT;
