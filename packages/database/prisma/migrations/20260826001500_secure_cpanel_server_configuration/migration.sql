UPDATE "servers"
SET "adapter_key" = 'fake-panel'
WHERE "adapter_key" = 'fake-cpanel';

ALTER TABLE "servers"
  ADD CONSTRAINT "servers_credential_pair_check" CHECK (
    ("credentials_ciphertext" IS NULL AND "credential_key_version" IS NULL)
    OR
    ("credentials_ciphertext" IS NOT NULL AND "credential_key_version" IS NOT NULL)
  ),
  ADD CONSTRAINT "servers_cpanel_configuration_check" CHECK (
    "adapter_key" <> 'cpanel-whm'
    OR (
      "use_tls" = TRUE
      AND "port" IN (443, 2087)
      AND "api_username" IS NOT NULL
      AND "credentials_ciphertext" IS NOT NULL
      AND "credential_key_version" IS NOT NULL
    )
  );
