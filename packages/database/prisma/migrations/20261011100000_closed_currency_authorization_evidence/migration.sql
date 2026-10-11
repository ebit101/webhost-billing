-- Historical non-secret facts only. No issuer, enrollment or authority initialization.
BEGIN;

ALTER TABLE "admin_profiles" ADD CONSTRAINT "admin_profiles_id_user_id_key" UNIQUE ("id", "user_id");

CREATE TABLE "currency_authorization_evidence" (
  "id" UUID NOT NULL,
  "execution_domain_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "admin_profile_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "auth_epoch" BIGINT NOT NULL,
  "credential_id" UUID NOT NULL,
  "recovery_set_epoch" BIGINT NOT NULL,
  "factor_kind" VARCHAR(8) COLLATE pg_catalog."C" NOT NULL,
  "recovery_code_id" UUID,
  "installation_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "currency_authorization_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "currency_authorization_evidence_uuid_check" CHECK (
    "id"::text ~ '^(00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$'
    AND "execution_domain_id"::text ~ '^(00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$'
    AND "actor_user_id"::text ~ '^(00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$'
    AND "admin_profile_id"::text ~ '^(00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$'
    AND "session_id"::text ~ '^(00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$'
    AND "credential_id"::text ~ '^(00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$'
    AND "installation_id"::text ~ '^(00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$'
    AND ("recovery_code_id" IS NULL OR "recovery_code_id"::text ~ '^(00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$')
  ),
  CONSTRAINT "currency_authorization_evidence_epoch_check" CHECK ("auth_epoch" BETWEEN 1 AND 9223372036854775807 AND "recovery_set_epoch" BETWEEN 1 AND 9223372036854775807),
  CONSTRAINT "currency_authorization_evidence_factor_check" CHECK (
    ("factor_kind" = 'totp' AND "recovery_code_id" IS NULL)
    OR ("factor_kind" = 'recovery' AND "recovery_code_id" IS NOT NULL)
  ),
  CONSTRAINT "currency_authorization_evidence_time_check" CHECK (pg_catalog.isfinite("created_at")),
  CONSTRAINT "currency_authorization_evidence_installation_fkey" FOREIGN KEY ("installation_id") REFERENCES "currency_installations"("installation_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "currency_authorization_evidence_domain_fkey" FOREIGN KEY ("installation_id", "execution_domain_id") REFERENCES "currency_execution_domains"("installation_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "currency_authorization_evidence_actor_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "currency_authorization_evidence_profile_owner_fkey" FOREIGN KEY ("admin_profile_id", "actor_user_id") REFERENCES "admin_profiles"("id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "currency_authorization_evidence_session_owner_fkey" FOREIGN KEY ("session_id", "actor_user_id") REFERENCES "auth_sessions"("id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE FUNCTION deny_currency_authorization_evidence_mutation() RETURNS pg_catalog.trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Closed currency authorization evidence mutation denied.';
END;
$$;

CREATE TRIGGER "currency_authorization_evidence_no_insert" BEFORE INSERT ON "currency_authorization_evidence"
FOR EACH STATEMENT EXECUTE FUNCTION deny_currency_authorization_evidence_mutation();
CREATE TRIGGER "currency_authorization_evidence_no_update" BEFORE UPDATE ON "currency_authorization_evidence"
FOR EACH STATEMENT EXECUTE FUNCTION deny_currency_authorization_evidence_mutation();
CREATE TRIGGER "currency_authorization_evidence_no_delete" BEFORE DELETE ON "currency_authorization_evidence"
FOR EACH STATEMENT EXECUTE FUNCTION deny_currency_authorization_evidence_mutation();
CREATE TRIGGER "currency_authorization_evidence_no_truncate" BEFORE TRUNCATE ON "currency_authorization_evidence"
FOR EACH STATEMENT EXECUTE FUNCTION deny_currency_authorization_evidence_mutation();

REVOKE ALL ON TABLE "currency_authorization_evidence" FROM PUBLIC;
REVOKE ALL ON FUNCTION deny_currency_authorization_evidence_mutation() FROM PUBLIC;
COMMIT;
