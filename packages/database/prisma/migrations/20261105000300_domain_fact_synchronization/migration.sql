BEGIN;
CREATE TABLE domain_fact_syncs (
  id UUID PRIMARY KEY, domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  account_id UUID NOT NULL REFERENCES registrar_accounts(id) ON DELETE RESTRICT,
  provider_order_id VARCHAR(64) NOT NULL, binding_hash CHAR(64) NOT NULL,
  previous_expires_at TIMESTAMPTZ(3), status VARCHAR(24) NOT NULL DEFAULT 'RUNNING',
  code VARCHAR(64), facts JSONB, started_at TIMESTAMPTZ(3) NOT NULL,
  finished_at TIMESTAMPTZ(3), applied_at TIMESTAMPTZ(3),
  CONSTRAINT domain_fact_syncs_state_check CHECK (
    status IN ('RUNNING','SUCCEEDED','REVIEW_REQUIRED','UNAVAILABLE')
    AND binding_hash ~ '^[0-9a-f]{64}$'
    AND (code IS NULL OR code ~ '^[A-Z_]{1,64}$')
    AND (facts IS NULL OR jsonb_typeof(facts)='object')
    AND ((status='RUNNING' AND finished_at IS NULL) OR (status<>'RUNNING' AND finished_at IS NOT NULL AND finished_at>=started_at))
    AND (applied_at IS NULL OR (status='SUCCEEDED' AND facts IS NOT NULL AND applied_at>=started_at))
  )
);
CREATE INDEX domain_fact_syncs_domain_started_idx ON domain_fact_syncs(domain_id,started_at);
CREATE UNIQUE INDEX domain_fact_syncs_one_running_key ON domain_fact_syncs(domain_id) WHERE status='RUNNING';
COMMIT;
