-- AlterTable
ALTER TABLE "store_orders" ADD COLUMN     "deliveryId" TEXT,
ADD COLUMN     "rideAttempt" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rideIssue" VARCHAR(300);

-- CreateIndex
CREATE UNIQUE INDEX "store_orders_deliveryId_key" ON "store_orders"("deliveryId");

-- AddForeignKey
ALTER TABLE "store_orders" ADD CONSTRAINT "store_orders_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

