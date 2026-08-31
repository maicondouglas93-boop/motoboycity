-- Sandbox and production are separate Asaas accounts. Persist the provider
-- environment so identifiers created during homologation are never reused
-- when real billing is enabled. Existing records came from the Sandbox smoke
-- test and are therefore backfilled as SANDBOX by the column defaults.
CREATE TYPE "AsaasEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');

ALTER TABLE "asaas_customers"
  ADD COLUMN "environment" "AsaasEnvironment" NOT NULL DEFAULT 'SANDBOX';

ALTER TABLE "invoice_pix_charges"
  ADD COLUMN "environment" "AsaasEnvironment" NOT NULL DEFAULT 'SANDBOX';

ALTER TABLE "asaas_webhook_events"
  ADD COLUMN "environment" "AsaasEnvironment" NOT NULL DEFAULT 'SANDBOX';

DROP INDEX "asaas_customers_companyId_key";
DROP INDEX "asaas_customers_providerCustomerId_key";
DROP INDEX "asaas_customers_status_idx";

CREATE UNIQUE INDEX "asaas_customers_companyId_environment_key"
  ON "asaas_customers"("companyId", "environment");
CREATE UNIQUE INDEX "asaas_customers_environment_providerCustomerId_key"
  ON "asaas_customers"("environment", "providerCustomerId");
CREATE INDEX "asaas_customers_environment_status_idx"
  ON "asaas_customers"("environment", "status");

DROP INDEX "invoice_pix_charges_invoiceId_key";
DROP INDEX "invoice_pix_charges_providerPaymentId_key";
DROP INDEX "invoice_pix_charges_externalReference_key";
DROP INDEX "invoice_pix_charges_status_idx";

CREATE UNIQUE INDEX "invoice_pix_charges_invoiceId_environment_key"
  ON "invoice_pix_charges"("invoiceId", "environment");
CREATE UNIQUE INDEX "invoice_pix_charges_environment_providerPaymentId_key"
  ON "invoice_pix_charges"("environment", "providerPaymentId");
CREATE UNIQUE INDEX "invoice_pix_charges_environment_externalReference_key"
  ON "invoice_pix_charges"("environment", "externalReference");
CREATE INDEX "invoice_pix_charges_environment_status_idx"
  ON "invoice_pix_charges"("environment", "status");

DROP INDEX "asaas_webhook_events_providerPaymentId_idx";
DROP INDEX "asaas_webhook_events_status_receivedAt_idx";

ALTER TABLE "asaas_webhook_events"
  DROP CONSTRAINT "asaas_webhook_events_pkey",
  ADD CONSTRAINT "asaas_webhook_events_pkey" PRIMARY KEY ("environment", "id");

CREATE INDEX "asaas_webhook_events_environment_providerPaymentId_idx"
  ON "asaas_webhook_events"("environment", "providerPaymentId");
CREATE INDEX "asaas_webhook_events_environment_status_receivedAt_idx"
  ON "asaas_webhook_events"("environment", "status", "receivedAt");
