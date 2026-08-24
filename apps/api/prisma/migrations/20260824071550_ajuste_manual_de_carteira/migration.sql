-- AlterTable
ALTER TABLE "wallet_transactions" ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "reason" VARCHAR(300);

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
