-- AlterTable
ALTER TABLE "withdrawal_requests" ADD COLUMN     "paymentReference" TEXT;

-- CreateTable
CREATE TABLE "withdrawal_request_status_history" (
    "id" TEXT NOT NULL,
    "withdrawalRequestId" TEXT NOT NULL,
    "fromStatus" "WithdrawalRequestStatus",
    "toStatus" "WithdrawalRequestStatus" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedByUserId" TEXT,
    "note" TEXT,

    CONSTRAINT "withdrawal_request_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "withdrawal_request_status_history_withdrawalRequestId_idx" ON "withdrawal_request_status_history"("withdrawalRequestId");

-- AddForeignKey
ALTER TABLE "withdrawal_request_status_history" ADD CONSTRAINT "withdrawal_request_status_history_withdrawalRequestId_fkey" FOREIGN KEY ("withdrawalRequestId") REFERENCES "withdrawal_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_request_status_history" ADD CONSTRAINT "withdrawal_request_status_history_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
