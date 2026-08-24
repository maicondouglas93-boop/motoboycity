-- CreateEnum
CREATE TYPE "VirtualSecretaryAuditStatus" AS ENUM ('SUCCESS', 'ERROR');

-- AlterTable
ALTER TABLE "surcharges" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "virtual_secretary_audits" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "toolName" VARCHAR(80),
    "parameters" JSONB,
    "result" JSONB,
    "status" "VirtualSecretaryAuditStatus" NOT NULL,
    "errorMessage" VARCHAR(500),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "virtual_secretary_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "virtual_secretary_audits_requestId_idx" ON "virtual_secretary_audits"("requestId");

-- CreateIndex
CREATE INDEX "virtual_secretary_audits_adminId_createdAt_idx" ON "virtual_secretary_audits"("adminId", "createdAt");

-- AddForeignKey
ALTER TABLE "virtual_secretary_audits" ADD CONSTRAINT "virtual_secretary_audits_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
