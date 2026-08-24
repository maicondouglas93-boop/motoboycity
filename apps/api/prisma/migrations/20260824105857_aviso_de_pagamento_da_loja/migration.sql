-- CreateEnum
CREATE TYPE "InvoicePaymentNoticeStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- CreateTable
CREATE TABLE "invoice_payment_notices" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paidAt" DATE NOT NULL,
    "note" VARCHAR(280),
    "status" "InvoicePaymentNoticeStatus" NOT NULL DEFAULT 'PENDING',
    "createdByUserId" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" VARCHAR(280),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_payment_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_payment_notices_status_idx" ON "invoice_payment_notices"("status");

-- CreateIndex
CREATE INDEX "invoice_payment_notices_invoiceId_idx" ON "invoice_payment_notices"("invoiceId");

-- Uma fatura pode ter historico de varios avisos, mas apenas um deles pode
-- aguardar conferencia. A restricao parcial fecha a janela de clique duplo e
-- de duas instancias da API criando o mesmo aviso ao mesmo tempo.
CREATE UNIQUE INDEX "invoice_payment_notices_one_pending_per_invoice_idx"
ON "invoice_payment_notices"("invoiceId")
WHERE "status" = 'PENDING';

-- AddForeignKey
ALTER TABLE "invoice_payment_notices" ADD CONSTRAINT "invoice_payment_notices_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_payment_notices" ADD CONSTRAINT "invoice_payment_notices_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_payment_notices" ADD CONSTRAINT "invoice_payment_notices_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
