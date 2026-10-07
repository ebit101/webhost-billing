-- Empty unused staging store. No history assessment, selected policy or seed.
CREATE TABLE "currency_controls" (
  "id" SMALLINT NOT NULL,
  "generation" BIGINT NOT NULL DEFAULT 0,
  "selected_policy_revision" VARCHAR(64),
  "history_latched" BOOLEAN,
  "base_code" VARCHAR(3),
  "base_metadata_version" VARCHAR(64),
  "base_minor_unit_exponent" SMALLINT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "currency_controls_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "currency_controls_singleton_check" CHECK ("id" = 1),
  CONSTRAINT "currency_controls_generation_check" CHECK ("generation" >= 0),
  CONSTRAINT "currency_controls_unassessed_check" CHECK (
    "generation" = 0 AND "selected_policy_revision" IS NULL
    AND "history_latched" IS NULL AND "base_code" IS NULL
    AND "base_metadata_version" IS NULL AND "base_minor_unit_exponent" IS NULL
  ),
  CONSTRAINT "currency_controls_policy_fkey" FOREIGN KEY ("selected_policy_revision")
    REFERENCES "currency_policy_revisions"("revision") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "currency_controls_base_unit_fkey" FOREIGN KEY ("base_code", "base_metadata_version")
    REFERENCES "currency_unit_definitions"("code", "metadata_version") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE FUNCTION deny_currency_control_mutation() RETURNS pg_catalog.trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Unassessed currency control mutation denied.';
END;
$$;

CREATE TRIGGER "currency_controls_no_update" BEFORE UPDATE ON "currency_controls"
FOR EACH STATEMENT EXECUTE FUNCTION deny_currency_control_mutation();
CREATE TRIGGER "currency_controls_no_delete" BEFORE DELETE ON "currency_controls"
FOR EACH STATEMENT EXECUTE FUNCTION deny_currency_control_mutation();
CREATE TRIGGER "currency_controls_no_truncate" BEFORE TRUNCATE ON "currency_controls"
FOR EACH STATEMENT EXECUTE FUNCTION deny_currency_control_mutation();
