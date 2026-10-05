-- CreateTable
CREATE TABLE "company_page_protection_recoveries" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "question" VARCHAR(200) NOT NULL,
    "answer_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_page_protection_recoveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_page_protection_recoveries_company_id_key" ON "company_page_protection_recoveries"("company_id");

-- AddForeignKey
ALTER TABLE "company_page_protection_recoveries" ADD CONSTRAINT "company_page_protection_recoveries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

