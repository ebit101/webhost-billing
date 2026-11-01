-- Widen ordinary and multi-label extensions without rewriting historical rows.
BEGIN;
ALTER TABLE "domain_offers" ALTER COLUMN "tld" TYPE VARCHAR(50);
ALTER TABLE "domain_offers" DROP CONSTRAINT "domain_offer_tld";
ALTER TABLE "domain_offers" ADD CONSTRAINT "domain_offer_tld"
  CHECK (tld ~ '^[a-z]{2,63}(\.[a-z]{2,63})*$');

ALTER TABLE "domain_catalogue_tlds" DROP CONSTRAINT "domain_catalogue_tlds_tld_check";
ALTER TABLE "domain_catalogue_tlds" ADD CONSTRAINT "domain_catalogue_tlds_tld_check"
  CHECK (tld ~ '^[a-z]{2,63}(\.[a-z]{2,63})*$');
ALTER TABLE "domain_catalogue_tlds" DROP CONSTRAINT "domain_catalogue_tlds_check";
ALTER TABLE "domain_catalogue_tlds" ADD CONSTRAINT "domain_catalogue_tlds_check"
  CHECK (NOT enabled OR registration_price_id IS NOT NULL);

ALTER TABLE "domain_quotes" DROP CONSTRAINT "quote_canonical_name";
ALTER TABLE "domain_quotes" ADD CONSTRAINT "quote_canonical_name" CHECK (
  domain_name = lower(domain_name) AND domain_name NOT LIKE 'xn--%'
  AND domain_name ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.[a-z]{2,63}(\.[a-z]{2,63})*$'
  AND length(substring(domain_name from position('.' in domain_name) + 1)) <= 50
);
ALTER TABLE "domains" DROP CONSTRAINT "domain_canonical_name";
ALTER TABLE "domains" ADD CONSTRAINT "domain_canonical_name" CHECK (
  domain_name = lower(domain_name) AND domain_name NOT LIKE 'xn--%'
  AND domain_name ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.[a-z]{2,63}(\.[a-z]{2,63})*$'
  AND length(substring(domain_name from position('.' in domain_name) + 1)) <= 50
);

-- Preserve reviewed prices, revisions and registrar scope, binding the full suffix.
CREATE OR REPLACE FUNCTION domain_quote_selection_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.selection_snapshot IS NOT NULL THEN
  IF NEW.selection_snapshot->>'schemaVersion' IS DISTINCT FROM '1' OR
    NOT EXISTS(SELECT 1 FROM domain_catalogue_tlds c JOIN product_prices p ON p.id=c.registration_price_id
     WHERE c.id=(NEW.selection_snapshot->>'catalogueId')::uuid AND c.revision=(NEW.selection_snapshot->>'catalogueRevision')::integer
      AND c.enabled AND c.tld=substring(NEW.domain_name from position('.' in NEW.domain_name)+1)
      AND p.id=(NEW.selection_snapshot->>'priceId')::uuid AND p.amount=NEW.selling_amount
      AND p.currency='BDT' AND p.product_id=c.product_id) OR
    jsonb_typeof(NEW.selection_snapshot->'eligibleRegistrars') IS DISTINCT FROM 'array' OR
    NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.selection_snapshot->'eligibleRegistrars') e WHERE e->>'id'=NEW.account_id::text) THEN
   RAISE EXCEPTION 'Quote selection snapshot does not match the reviewed catalogue';
  END IF;
 END IF;
 RETURN NEW;
END $$;
COMMIT;
