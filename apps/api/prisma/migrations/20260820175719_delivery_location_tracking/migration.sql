-- CreateTable
CREATE TABLE "delivery_location_points" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "lat" DECIMAL(10,7) NOT NULL,
    "lng" DECIMAL(10,7) NOT NULL,
    "accuracy" DECIMAL(8,2),
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_location_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delivery_location_points_deliveryId_capturedAt_idx" ON "delivery_location_points"("deliveryId", "capturedAt");

-- CreateIndex
CREATE INDEX "delivery_location_points_capturedAt_idx" ON "delivery_location_points"("capturedAt");

-- AddForeignKey
ALTER TABLE "delivery_location_points" ADD CONSTRAINT "delivery_location_points_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_location_points" ADD CONSTRAINT "delivery_location_points_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
