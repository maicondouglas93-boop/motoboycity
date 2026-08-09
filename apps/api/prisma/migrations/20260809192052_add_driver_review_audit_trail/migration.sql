-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
