/*
  Warnings:

  - A unique constraint covering the columns `[integrationId,externalOrderId]` on the table `deliveries` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "IntegrationInboundStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'IGNORED', 'REVIEW', 'FAILED');

-- CreateEnum
CREATE TYPE "IntegrationLogisticAction" AS ENUM ('PICKUP_ONGOING', 'DELIVERY_ONGOING', 'ORDER_DELIVERED', 'DELIVERY_CANCELED');

-- CreateEnum
CREATE TYPE "IntegrationOutboundStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED_RETRYABLE', 'FAILED_FINAL');

-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN     "externalOrderId" VARCHAR(100),
ADD COLUMN     "integrationId" TEXT;

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "aiqfomeDispatchDelayMinutes" INTEGER;

-- CreateTable
CREATE TABLE "integration_inbound_events" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "deliveryId" TEXT,
    "eventType" VARCHAR(60) NOT NULL,
    "externalOrderId" VARCHAR(100) NOT NULL,
    "storeId" VARCHAR(100) NOT NULL,
    "eventHash" VARCHAR(64) NOT NULL,
    "status" "IntegrationInboundStatus" NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorCode" VARCHAR(100),
    "eventAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_inbound_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_outbound_events" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "externalOrderId" VARCHAR(100) NOT NULL,
    "action" "IntegrationLogisticAction" NOT NULL,
    "status" "IntegrationOutboundStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "errorCode" VARCHAR(100),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_outbound_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integration_inbound_events_integrationId_externalOrderId_idx" ON "integration_inbound_events"("integrationId", "externalOrderId");

-- CreateIndex
CREATE INDEX "integration_inbound_events_status_receivedAt_idx" ON "integration_inbound_events"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "integration_inbound_events_integrationId_eventHash_key" ON "integration_inbound_events"("integrationId", "eventHash");

-- CreateIndex
CREATE INDEX "integration_outbound_events_status_nextAttemptAt_idx" ON "integration_outbound_events"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "integration_outbound_events_integrationId_deliveryId_action_key" ON "integration_outbound_events"("integrationId", "deliveryId", "action");

-- CreateIndex
CREATE INDEX "deliveries_integrationId_idx" ON "deliveries"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_integrationId_externalOrderId_key" ON "deliveries"("integrationId", "externalOrderId");

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_inbound_events" ADD CONSTRAINT "integration_inbound_events_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_inbound_events" ADD CONSTRAINT "integration_inbound_events_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_outbound_events" ADD CONSTRAINT "integration_outbound_events_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_outbound_events" ADD CONSTRAINT "integration_outbound_events_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
