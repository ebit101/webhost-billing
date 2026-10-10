-- Empty inert facts only. No identity initialization, current placement or authority.
CREATE TABLE "currency_installations" (
  "id" SMALLINT NOT NULL,
  "installation_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "currency_installations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "currency_installations_installation_id_key" UNIQUE ("installation_id"),
  CONSTRAINT "currency_installations_singleton_check" CHECK ("id" = 1),
  CONSTRAINT "currency_installations_time_check" CHECK (pg_catalog.isfinite("created_at"))
);

CREATE TABLE "currency_execution_domains" (
  "id" UUID NOT NULL,
  "installation_id" UUID NOT NULL,
  "database_name" VARCHAR(63) COLLATE pg_catalog."C" NOT NULL,
  "schema_name" VARCHAR(63) COLLATE pg_catalog."C" NOT NULL,
  "placement_manifest_digest" VARCHAR(64) COLLATE pg_catalog."C" NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "currency_execution_domains_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "currency_execution_domains_installation_id_id_key" UNIQUE ("installation_id", "id"),
  CONSTRAINT "currency_execution_domains_installation_fkey" FOREIGN KEY ("installation_id")
    REFERENCES "currency_installations"("installation_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "currency_execution_domains_database_name_check" CHECK (
    pg_catalog.length("database_name") BETWEEN 1 AND 63
    AND "database_name" ~ '^[a-z_]' AND "database_name" !~ '[^a-z0-9_]'
    AND pg_catalog.left("database_name", 3) <> 'pg_' AND "database_name" <> 'information_schema'
  ),
  CONSTRAINT "currency_execution_domains_schema_name_check" CHECK (
    pg_catalog.length("schema_name") BETWEEN 1 AND 63
    AND "schema_name" ~ '^[a-z_]' AND "schema_name" !~ '[^a-z0-9_]'
    AND pg_catalog.left("schema_name", 3) <> 'pg_' AND "schema_name" <> 'information_schema'
  ),
  CONSTRAINT "currency_execution_domains_manifest_check" CHECK (
    pg_catalog.length("placement_manifest_digest") = 64
    AND "placement_manifest_digest" !~ '[^a-f0-9]'
  ),
  CONSTRAINT "currency_execution_domains_time_check" CHECK (pg_catalog.isfinite("created_at"))
);

CREATE FUNCTION deny_currency_identity_mutation() RETURNS pg_catalog.trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Immutable currency identity mutation denied.';
END;
$$;

CREATE TRIGGER "currency_installations_no_update" BEFORE UPDATE ON "currency_installations"
FOR EACH STATEMENT EXECUTE FUNCTION deny_currency_identity_mutation();
CREATE TRIGGER "currency_installations_no_delete" BEFORE DELETE ON "currency_installations"
FOR EACH STATEMENT EXECUTE FUNCTION deny_currency_identity_mutation();
CREATE TRIGGER "currency_installations_no_truncate" BEFORE TRUNCATE ON "currency_installations"
FOR EACH STATEMENT EXECUTE FUNCTION deny_currency_identity_mutation();
CREATE TRIGGER "currency_execution_domains_no_update" BEFORE UPDATE ON "currency_execution_domains"
FOR EACH STATEMENT EXECUTE FUNCTION deny_currency_identity_mutation();
CREATE TRIGGER "currency_execution_domains_no_delete" BEFORE DELETE ON "currency_execution_domains"
FOR EACH STATEMENT EXECUTE FUNCTION deny_currency_identity_mutation();
CREATE TRIGGER "currency_execution_domains_no_truncate" BEFORE TRUNCATE ON "currency_execution_domains"
FOR EACH STATEMENT EXECUTE FUNCTION deny_currency_identity_mutation();

-- Ownership powers remain; this does not install production duty separation.
REVOKE ALL ON TABLE "currency_installations", "currency_execution_domains" FROM PUBLIC;
REVOKE ALL ON FUNCTION deny_currency_identity_mutation() FROM PUBLIC;
