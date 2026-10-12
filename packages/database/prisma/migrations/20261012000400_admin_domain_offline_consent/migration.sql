ALTER TABLE domain_quotes ADD COLUMN offline_consent JSONB;

ALTER TABLE domain_quotes ADD CONSTRAINT domain_quote_offline_consent_shape CHECK (
  offline_consent IS NULL OR (
    jsonb_typeof(offline_consent) = 'object'
    AND offline_consent->>'method' IN ('PHONE', 'IN_PERSON', 'WRITTEN')
    AND length(offline_consent->>'reference') BETWEEN 3 AND 160
    AND (offline_consent->>'recordedBy')::uuid IS NOT NULL
    AND (offline_consent->>'consentedAt')::timestamptz IS NOT NULL
    AND (offline_consent->>'recordedAt')::timestamptz IS NOT NULL
  )
);
