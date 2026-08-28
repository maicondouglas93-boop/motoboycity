-- AlterTable
ALTER TABLE "integrations" ADD COLUMN     "oauthAttemptId" TEXT,
ADD COLUMN     "publicId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "integration_credentials" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "encryptedPayload" TEXT NOT NULL,
    "iv" VARCHAR(24) NOT NULL,
    "authTag" VARCHAR(24) NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_credentials_integrationId_key" ON "integration_credentials"("integrationId");

-- CreateIndex
CREATE INDEX "integration_credentials_expiresAt_idx" ON "integration_credentials"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_publicId_key" ON "integrations"("publicId");

-- CreateIndex
CREATE INDEX "integrations_provider_status_idx" ON "integrations"("provider", "status");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_companyId_provider_key" ON "integrations"("companyId", "provider");

-- AddForeignKey
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
