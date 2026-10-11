-- CreateEnum
BEGIN;
CREATE TYPE "ProductKind" AS ENUM ('HOSTING', 'DOMAIN');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "kind" "ProductKind" NOT NULL DEFAULT 'HOSTING';

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "kind" "ProductKind" NOT NULL DEFAULT 'HOSTING';

-- CreateTable
CREATE TABLE "registrar_accounts" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL DEFAULT 'stargate',
    "mode" VARCHAR(16) NOT NULL DEFAULT 'FAKE',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registrar_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrar_credentials" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registrar_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_offers" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "price_id" UUID NOT NULL,
    "tld" VARCHAR(8) NOT NULL,
    "nameservers" JSONB NOT NULL,

    CONSTRAINT "domain_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_quotes" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "domain_name" VARCHAR(253) NOT NULL,
    "selling_amount" BIGINT NOT NULL,
    "cost_amount" BIGINT NOT NULL,
    "cost_currency" CHAR(3) NOT NULL,
    "contact_ciphertext" TEXT NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "nameservers" JSONB NOT NULL,
    "agreement" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "domain_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domains" (
    "id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "domain_name" VARCHAR(253) NOT NULL,
    "submission_key" UUID NOT NULL,
    "state" VARCHAR(32) NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "verification" VARCHAR(32) NOT NULL DEFAULT 'Pending',
    "provider_order_id" VARCHAR(64),
    "expires_at" TIMESTAMPTZ(3),
    "auto_renew" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrar_operations" (
    "id" UUID NOT NULL,
    "domain_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "credential_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "cost_ceiling" BIGINT NOT NULL,
    "claimed_at" TIMESTAMPTZ(3),
    "next_poll_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "poll_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registrar_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrar_evidence" (
    "id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registrar_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrar_mappings" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "remote_customer_id" VARCHAR(64) NOT NULL,
    "remote_contact_id" VARCHAR(64) NOT NULL,

    CONSTRAINT "registrar_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fake_registrar_registrations" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "domain_name" VARCHAR(253) NOT NULL,
    "operation_id" UUID NOT NULL,
    "state" VARCHAR(32) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fake_registrar_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registrar_credentials_account_id_version_key" ON "registrar_credentials"("account_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "domain_offers_product_id_key" ON "domain_offers"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "domain_offers_price_id_key" ON "domain_offers"("price_id");

-- CreateIndex
CREATE UNIQUE INDEX "domain_offers_account_id_tld_key" ON "domain_offers"("account_id", "tld");

-- CreateIndex
CREATE INDEX "domain_quotes_customer_id_created_at_idx" ON "domain_quotes"("customer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "domain_quotes_id_customer_id_account_id_key" ON "domain_quotes"("id", "customer_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "domains_quote_id_key" ON "domains"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "domains_order_item_id_key" ON "domains"("order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "domains_invoice_id_key" ON "domains"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "domains_domain_name_key" ON "domains"("domain_name");

-- CreateIndex
CREATE UNIQUE INDEX "domains_submission_key_key" ON "domains"("submission_key");

-- CreateIndex
CREATE INDEX "domains_customer_id_created_at_idx" ON "domains"("customer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "domains_account_id_provider_order_id_key" ON "domains"("account_id", "provider_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "domains_id_customer_id_account_id_key" ON "domains"("id", "customer_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "registrar_operations_domain_id_key" ON "registrar_operations"("domain_id");

-- CreateIndex
CREATE INDEX "registrar_evidence_operation_id_created_at_idx" ON "registrar_evidence"("operation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "registrar_mappings_account_id_customer_id_fingerprint_key" ON "registrar_mappings"("account_id", "customer_id", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "registrar_mappings_account_id_remote_customer_id_remote_con_key" ON "registrar_mappings"("account_id", "remote_customer_id", "remote_contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "fake_registrar_registrations_operation_id_key" ON "fake_registrar_registrations"("operation_id");

-- CreateIndex
CREATE UNIQUE INDEX "fake_registrar_registrations_account_id_domain_name_key" ON "fake_registrar_registrations"("account_id", "domain_name");
-- Restrictive ownership and historical evidence boundaries, including raw SQL writers.
ALTER TABLE registrar_accounts ADD CONSTRAINT registrar_fake_only CHECK (provider = 'stargate' AND mode = 'FAKE');
ALTER TABLE registrar_credentials ADD FOREIGN KEY (account_id) REFERENCES registrar_accounts(id) ON DELETE RESTRICT;
ALTER TABLE registrar_credentials ADD UNIQUE (id, account_id);
ALTER TABLE domain_offers ADD FOREIGN KEY (account_id) REFERENCES registrar_accounts(id) ON DELETE RESTRICT;
ALTER TABLE domain_offers ADD FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;
ALTER TABLE domain_offers ADD FOREIGN KEY (price_id) REFERENCES product_prices(id) ON DELETE RESTRICT;
ALTER TABLE domain_offers ADD CONSTRAINT domain_offer_tld CHECK (tld IN ('com', 'net'));
ALTER TABLE domain_offers ADD CONSTRAINT domain_offers_id_account_id_key UNIQUE(id,account_id);
ALTER TABLE domain_quotes ADD FOREIGN KEY (offer_id,account_id) REFERENCES domain_offers(id,account_id) ON DELETE RESTRICT;
ALTER TABLE domain_quotes ADD CONSTRAINT quote_canonical_name CHECK (domain_name = lower(domain_name) AND domain_name ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.(com|net)$' AND domain_name NOT LIKE 'xn--%');
ALTER TABLE domains ADD CONSTRAINT domain_canonical_name CHECK (domain_name = lower(domain_name) AND domain_name ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.(com|net)$' AND domain_name NOT LIKE 'xn--%');
ALTER TABLE domain_quotes ADD FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;
ALTER TABLE domain_quotes ADD FOREIGN KEY (account_id) REFERENCES registrar_accounts(id) ON DELETE RESTRICT;
ALTER TABLE domain_quotes ADD FOREIGN KEY (offer_id) REFERENCES domain_offers(id) ON DELETE RESTRICT;
ALTER TABLE domain_quotes ADD CONSTRAINT domain_quote_money CHECK (selling_amount > 0 AND cost_amount > 0 AND cost_currency = 'USD');
ALTER TABLE domains ADD FOREIGN KEY (quote_id, customer_id, account_id) REFERENCES domain_quotes(id, customer_id, account_id) ON DELETE RESTRICT;
ALTER TABLE domains ADD FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE RESTRICT;
ALTER TABLE domains ADD FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT;
ALTER TABLE domains ADD CONSTRAINT domain_no_auto_renew CHECK (NOT auto_renew);
ALTER TABLE domains ADD CONSTRAINT domain_state CHECK (state IN ('AWAITING_PAYMENT','AWAITING_APPROVAL','PENDING','NEEDS_RECONCILIATION','FAILED','REGISTERED'));
ALTER TABLE registrar_operations ADD FOREIGN KEY (domain_id, customer_id, account_id) REFERENCES domains(id, customer_id, account_id) ON DELETE RESTRICT;
ALTER TABLE registrar_operations ADD FOREIGN KEY (credential_id, account_id) REFERENCES registrar_credentials(id, account_id) ON DELETE RESTRICT;
ALTER TABLE registrar_operations ADD FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE registrar_operations ADD CONSTRAINT registrar_budget CHECK (cost_ceiling > 0 AND poll_count BETWEEN 0 AND 10);
ALTER TABLE registrar_evidence ADD FOREIGN KEY (operation_id) REFERENCES registrar_operations(id) ON DELETE RESTRICT;
ALTER TABLE registrar_mappings ADD FOREIGN KEY (account_id) REFERENCES registrar_accounts(id) ON DELETE RESTRICT;
ALTER TABLE registrar_mappings ADD FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;
ALTER TABLE fake_registrar_registrations ADD FOREIGN KEY (operation_id) REFERENCES registrar_operations(id) ON DELETE RESTRICT;

CREATE FUNCTION registrar_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Registrar evidence and snapshots are immutable'; END $$;
CREATE TRIGGER quote_immutable BEFORE UPDATE OR DELETE ON domain_quotes FOR EACH ROW EXECUTE FUNCTION registrar_append_only();
CREATE TRIGGER credential_immutable BEFORE UPDATE OR DELETE ON registrar_credentials FOR EACH ROW EXECUTE FUNCTION registrar_append_only();
CREATE TRIGGER mapping_immutable BEFORE UPDATE OR DELETE ON registrar_mappings FOR EACH ROW EXECUTE FUNCTION registrar_append_only();
CREATE TRIGGER registrar_evidence_immutable BEFORE UPDATE OR DELETE ON registrar_evidence FOR EACH ROW EXECUTE FUNCTION registrar_append_only();
CREATE TRIGGER domain_offer_immutable BEFORE UPDATE OR DELETE ON domain_offers FOR EACH ROW EXECUTE FUNCTION registrar_append_only();

CREATE FUNCTION domain_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Domain history cannot be deleted'; END IF;
 IF TG_OP = 'UPDATE' AND (NEW.id,NEW.quote_id,NEW.customer_id,NEW.account_id,NEW.invoice_id,NEW.order_item_id,NEW.domain_name,NEW.submission_key,NEW.created_at) IS DISTINCT FROM
 (OLD.id,OLD.quote_id,OLD.customer_id,OLD.account_id,OLD.invoice_id,OLD.order_item_id,OLD.domain_name,OLD.submission_key,OLD.created_at) THEN RAISE EXCEPTION 'Domain identity is immutable'; END IF;
 IF NOT EXISTS (SELECT 1 FROM invoices i JOIN order_items oi ON oi.order_id=i.order_id JOIN domain_quotes q ON q.id=NEW.quote_id WHERE i.id=NEW.invoice_id AND oi.id=NEW.order_item_id AND i.customer_id=NEW.customer_id AND oi.kind='DOMAIN' AND oi.requested_domain=NEW.domain_name AND i.currency='BDT' AND q.domain_name=NEW.domain_name AND q.selling_amount=i.total AND oi.line_total=i.total) THEN RAISE EXCEPTION 'Domain billing ownership mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER domain_integrity_guard BEFORE INSERT OR UPDATE OR DELETE ON domains FOR EACH ROW EXECUTE FUNCTION domain_integrity();

CREATE FUNCTION domain_invoice_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM domains WHERE invoice_id=OLD.id) THEN
  IF (NEW.total,NEW.currency,NEW.customer_id,NEW.order_id,NEW.customer_name_snapshot,NEW.customer_email_snapshot,NEW.customer_address_snapshot,NEW.business_identity_snapshot,NEW.subtotal,NEW.tax_total,NEW.discount_total,NEW.credit_total,NEW.tax_identity_snapshot,NEW.invoice_number,NEW.issued_at,NEW.due_at) IS DISTINCT FROM
     (OLD.total,OLD.currency,OLD.customer_id,OLD.order_id,OLD.customer_name_snapshot,OLD.customer_email_snapshot,OLD.customer_address_snapshot,OLD.business_identity_snapshot,OLD.subtotal,OLD.tax_total,OLD.discount_total,OLD.credit_total,OLD.tax_identity_snapshot,OLD.invoice_number,OLD.issued_at,OLD.due_at) THEN RAISE EXCEPTION 'Issued domain invoice snapshot is immutable'; END IF;
  IF NEW.status='CANCELLED' AND EXISTS (SELECT 1 FROM domains d JOIN registrar_operations op ON op.domain_id=d.id WHERE d.invoice_id=OLD.id AND op.claimed_at IS NOT NULL) THEN RAISE EXCEPTION 'Claimed registration cannot be cancelled'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER domain_invoice_guard BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION domain_invoice_guard();

CREATE FUNCTION domain_order_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='COMPLETED' AND EXISTS (SELECT 1 FROM domains d JOIN order_items oi ON oi.id=d.order_item_id WHERE oi.order_id=OLD.id AND d.state<>'REGISTERED') THEN RAISE EXCEPTION 'Domain requires confirmed registration'; END IF;
 IF NEW.status IN ('CANCELLED','REJECTED','FAILED') AND EXISTS (SELECT 1 FROM domains d JOIN order_items oi ON oi.id=d.order_item_id JOIN registrar_operations op ON op.domain_id=d.id WHERE oi.order_id=OLD.id AND op.claimed_at IS NOT NULL) THEN RAISE EXCEPTION 'Claimed registration requires reconciliation'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER domain_order_guard BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION domain_order_guard();

CREATE FUNCTION registrar_operation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Registrar operations cannot be deleted'; END IF;
 IF (NEW.id,NEW.domain_id,NEW.customer_id,NEW.account_id,NEW.credential_id,NEW.actor_user_id,NEW.cost_ceiling,NEW.created_at) IS DISTINCT FROM
 (OLD.id,OLD.domain_id,OLD.customer_id,OLD.account_id,OLD.credential_id,OLD.actor_user_id,OLD.cost_ceiling,OLD.created_at)
 OR (OLD.claimed_at IS NOT NULL AND NEW.claimed_at IS DISTINCT FROM OLD.claimed_at)
 OR NEW.poll_count < OLD.poll_count THEN RAISE EXCEPTION 'Registrar intent and claim are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER registrar_operation_guard BEFORE UPDATE OR DELETE ON registrar_operations FOR EACH ROW EXECUTE FUNCTION registrar_operation_guard();
CREATE FUNCTION domain_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' AND EXISTS (SELECT 1 FROM domains WHERE invoice_id=OLD.invoice_id) THEN RAISE EXCEPTION 'Domain invoice lines are immutable'; END IF;
 IF TG_OP<>'DELETE' AND EXISTS (SELECT 1 FROM domains WHERE invoice_id=NEW.invoice_id) THEN RAISE EXCEPTION 'Domain invoice lines are immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER domain_line_guard BEFORE INSERT OR UPDATE OR DELETE ON invoice_items FOR EACH ROW EXECUTE FUNCTION domain_line_guard();

CREATE FUNCTION domain_payment_attention() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.amount_paid IS DISTINCT FROM OLD.amount_paid OR NEW.status IS DISTINCT FROM OLD.status THEN
  INSERT INTO registrar_evidence(id,operation_id,code)
  SELECT gen_random_uuid(),op.id,'PAYMENT_CHANGED_AFTER_DISPATCH'
  FROM domains d JOIN registrar_operations op ON op.domain_id=d.id
  WHERE d.invoice_id=NEW.id AND op.claimed_at IS NOT NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER domain_payment_attention AFTER UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION domain_payment_attention();
CREATE FUNCTION domain_service_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM order_items WHERE id=NEW.order_item_id AND kind='DOMAIN')
 OR EXISTS (SELECT 1 FROM products WHERE id=NEW.product_id AND kind='DOMAIN') THEN RAISE EXCEPTION 'Domains are not hosting services'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER domain_service_guard BEFORE INSERT OR UPDATE ON services FOR EACH ROW EXECUTE FUNCTION domain_service_guard();
COMMIT;
