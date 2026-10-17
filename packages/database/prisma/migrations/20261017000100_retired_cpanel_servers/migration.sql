ALTER TABLE "servers"
  DROP CONSTRAINT "servers_cpanel_configuration_check";

ALTER TABLE "servers"
  ADD CONSTRAINT "servers_cpanel_configuration_check" CHECK (
    "adapter_key" <> 'cpanel-whm'
    OR (
      "deleted_at" IS NOT NULL
      AND "status" = 'DISABLED'
      AND "api_username" IS NULL
      AND "credentials_ciphertext" IS NULL
      AND "credential_key_version" IS NULL
    )
    OR (
      "deleted_at" IS NULL
      AND "use_tls" = TRUE
      AND "port" IN (443, 2087)
      AND "api_username" IS NOT NULL
      AND "credentials_ciphertext" IS NOT NULL
      AND "credential_key_version" IS NOT NULL
    )
  );
