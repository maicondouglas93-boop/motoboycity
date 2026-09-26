-- CreateEnum
CREATE TYPE "StoreOrderStage" AS ENUM ('NOVO', 'ACEITO', 'EM_PREPARO', 'PRONTO', 'SAIU_PARA_ENTREGA', 'ENTREGUE', 'CANCELADO');

-- CreateEnum
CREATE TYPE "StoreOrderModality" AS ENUM ('ENTREGA', 'RETIRADA');

-- CreateEnum
CREATE TYPE "StoreOrderCourier" AS ENUM ('MOTOBOYCITY', 'LOJA');

-- CreateEnum
CREATE TYPE "StoreOrderCanceller" AS ENUM ('LOJA', 'CLIENTE', 'SISTEMA');

-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN     "acceptsOrders" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "store_orders" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "customerAuthId" VARCHAR(64) NOT NULL,
    "customerName" VARCHAR(80) NOT NULL,
    "customerPhone" VARCHAR(20) NOT NULL,
    "modality" "StoreOrderModality" NOT NULL,
    "stage" "StoreOrderStage" NOT NULL,
    "courier" "StoreOrderCourier",
    "history" JSONB NOT NULL,
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "prepMinutes" INTEGER NOT NULL,
    "deliveryMinutes" INTEGER NOT NULL,
    "acceptDeadline" TIMESTAMP(3),
    "address" JSONB,
    "items" JSONB NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "deliveryFee" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "paymentMethod" VARCHAR(30) NOT NULL,
    "changeFor" DECIMAL(10,2),
    "note" VARCHAR(200),
    "cancelReason" VARCHAR(200),
    "cancelledBy" "StoreOrderCanceller",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_orders_companyId_stage_idx" ON "store_orders"("companyId", "stage");

-- CreateIndex
CREATE INDEX "store_orders_companyId_customerAuthId_createdAt_idx" ON "store_orders"("companyId", "customerAuthId", "createdAt");

-- CreateIndex
CREATE INDEX "store_orders_stage_acceptDeadline_idx" ON "store_orders"("stage", "acceptDeadline");

-- CreateIndex
CREATE UNIQUE INDEX "store_orders_companyId_number_key" ON "store_orders"("companyId", "number");

-- AddForeignKey
ALTER TABLE "store_orders" ADD CONSTRAINT "store_orders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

