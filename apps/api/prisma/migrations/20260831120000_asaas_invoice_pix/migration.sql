CREATE TYPE "AsaasResourceStatus" AS ENUM ('CREATING', 'ACTIVE', 'FAILED');

CREATE TYPE "InvoicePixChargeStatus" AS ENUM (
  'CREATING',
  'ACTIVE',
  'RECEIVED',
  'CANCELLED',
  'FAILED',
  'RECONCILIATION_REQUIRED'
);

CREATE TYPE "AsaasWebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED');

CREATE TABLE "asaas_customers" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "providerCustomerId" TEXT,
  "status" "AsaasResourceStatus" NOT NULL DEFAULT 'CREATING',
  "errorCode" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "asaas_customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_pix_charges" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "providerPaymentId" TEXT,
  "providerCustomerId" TEXT,
  "externalReference" TEXT NOT NULL,
  "status" "InvoicePixChargeStatus" NOT NULL DEFAULT 'CREATING',
  "providerStatus" VARCHAR(40),
  "pixPayload" TEXT,
  "pixEncodedImage" TEXT,
  "expiresAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "errorCode" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "invoice_pix_charges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "asaas_webhook_events" (
  "id" VARCHAR(120) NOT NULL,
  "eventType" VARCHAR(80) NOT NULL,
  "providerPaymentId" VARCHAR(120),
  "chargeId" TEXT,
  "status" "AsaasWebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "note" VARCHAR(500),
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "asaas_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "asaas_customers_companyId_key" ON "asaas_customers"("companyId");
CREATE UNIQUE INDEX "asaas_customers_providerCustomerId_key" ON "asaas_customers"("providerCustomerId");
CREATE INDEX "asaas_customers_status_idx" ON "asaas_customers"("status");

CREATE UNIQUE INDEX "invoice_pix_charges_invoiceId_key" ON "invoice_pix_charges"("invoiceId");
CREATE UNIQUE INDEX "invoice_pix_charges_providerPaymentId_key" ON "invoice_pix_charges"("providerPaymentId");
CREATE UNIQUE INDEX "invoice_pix_charges_externalReference_key" ON "invoice_pix_charges"("externalReference");
CREATE INDEX "invoice_pix_charges_status_idx" ON "invoice_pix_charges"("status");

CREATE INDEX "asaas_webhook_events_providerPaymentId_idx" ON "asaas_webhook_events"("providerPaymentId");
CREATE INDEX "asaas_webhook_events_status_receivedAt_idx" ON "asaas_webhook_events"("status", "receivedAt");

ALTER TABLE "asaas_customers"
  ADD CONSTRAINT "asaas_customers_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoice_pix_charges"
  ADD CONSTRAINT "invoice_pix_charges_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "asaas_webhook_events"
  ADD CONSTRAINT "asaas_webhook_events_chargeId_fkey"
  FOREIGN KEY ("chargeId") REFERENCES "invoice_pix_charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;
