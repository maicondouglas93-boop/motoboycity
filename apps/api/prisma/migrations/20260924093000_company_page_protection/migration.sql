-- CreateTable
CREATE TABLE "company_page_protections" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "route_key" VARCHAR(100) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_page_protections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_page_protections_company_id_route_key_key" ON "company_page_protections"("company_id", "route_key");

-- CreateIndex
CREATE INDEX "company_page_protections_company_id_idx" ON "company_page_protections"("company_id");

-- AddForeignKey
ALTER TABLE "company_page_protections" ADD CONSTRAINT "company_page_protections_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
