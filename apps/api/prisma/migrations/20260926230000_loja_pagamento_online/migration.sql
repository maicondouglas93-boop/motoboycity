-- CreateEnum
CREATE TYPE "StoreOrderPaymentStatus" AS ENUM ('AGUARDANDO', 'PAGO', 'NAO_PAGO', 'ESTORNANDO', 'ESTORNADO', 'ESTORNO_FALHOU');

-- AlterEnum
ALTER TYPE "StoreOrderStage" ADD VALUE 'AGUARDANDO_PAGAMENTO';

-- AlterTable
ALTER TABLE "store_orders" ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentCheckedAt" TIMESTAMP(3),
ADD COLUMN     "paymentDueAt" TIMESTAMP(3),
ADD COLUMN     "paymentEnvironment" "AsaasEnvironment",
ADD COLUMN     "paymentIssue" VARCHAR(300),
ADD COLUMN     "paymentProviderId" VARCHAR(120),
ADD COLUMN     "paymentStatus" "StoreOrderPaymentStatus",
ADD COLUMN     "pixPayload" TEXT,
ADD COLUMN     "pixQrCode" TEXT;

-- CreateTable
CREATE TABLE "store_asaas_accounts" (
    "companyId" TEXT NOT NULL,
    "environment" "AsaasEnvironment" NOT NULL,
    "encryptedPayload" TEXT NOT NULL,
    "iv" VARCHAR(32) NOT NULL,
    "authTag" VARCHAR(32) NOT NULL,
    "keyVersion" INTEGER NOT NULL,
    "webhookId" VARCHAR(120),
    "accountName" VARCHAR(200) NOT NULL,
    "accountEmail" VARCHAR(200),
    "hasPixKey" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_asaas_accounts_pkey" PRIMARY KEY ("companyId")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_orders_paymentProviderId_key" ON "store_orders"("paymentProviderId");

-- CreateIndex
CREATE INDEX "store_orders_paymentStatus_paymentDueAt_idx" ON "store_orders"("paymentStatus", "paymentDueAt");

-- AddForeignKey
ALTER TABLE "store_asaas_accounts" ADD CONSTRAINT "store_asaas_accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

