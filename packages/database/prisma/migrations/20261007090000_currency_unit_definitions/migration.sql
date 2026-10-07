-- Empty, additive storage only. No registry seed or financial backfill.
CREATE TABLE "currency_unit_definitions" (
  "code" VARCHAR(3) NOT NULL,
  "metadata_version" VARCHAR(64) NOT NULL,
  "minor_unit_exponent" SMALLINT NOT NULL,
  "provenance" VARCHAR(256) NOT NULL,
  "status" VARCHAR(10) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "currency_unit_definitions_pkey" PRIMARY KEY ("code", "metadata_version"),
  CONSTRAINT "currency_unit_definitions_code_check" CHECK (
    octet_length("code") = 3 AND "code" COLLATE "C" ~ '^[A-Z]{3}$'
  ),
  CONSTRAINT "currency_unit_definitions_version_check" CHECK (
    octet_length("metadata_version") BETWEEN 1 AND 64
    AND "metadata_version" COLLATE "C" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    AND "metadata_version" COLLATE "C" !~ '[^A-Za-z0-9._:-]'
  ),
  CONSTRAINT "currency_unit_definitions_exponent_check" CHECK ("minor_unit_exponent" BETWEEN 0 AND 4),
  CONSTRAINT "currency_unit_definitions_provenance_check" CHECK (
    octet_length("provenance") BETWEEN 1 AND 256
    AND "provenance" COLLATE "C" ~ '^[!-~]([ -~]*[!-~])?$'
    AND "provenance" COLLATE "C" !~ '[^ -~]'
  ),
  CONSTRAINT "currency_unit_definitions_status_check" CHECK ("status" IN ('current', 'historical'))
);

-- Ordinary SQL cannot rewrite, remove or truncate version evidence, even for
-- no-op/empty statements. Database owners can still disable/drop these controls.
CREATE FUNCTION reject_currency_unit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Currency unit versions are immutable' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER currency_unit_definitions_immutable
BEFORE UPDATE OR DELETE OR TRUNCATE ON "currency_unit_definitions"
FOR EACH STATEMENT EXECUTE FUNCTION reject_currency_unit_mutation();
