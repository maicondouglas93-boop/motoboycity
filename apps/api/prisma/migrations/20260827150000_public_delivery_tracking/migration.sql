-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN     "publicTrackingIssuedAt" TIMESTAMP(3),
ADD COLUMN     "publicTrackingTokenId" VARCHAR(43);

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_publicTrackingTokenId_key" ON "deliveries"("publicTrackingTokenId");
