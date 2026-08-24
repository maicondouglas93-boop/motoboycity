-- Normalize any legacy race residue before enforcing the invariant. The
-- newest table in each global/company scope remains active.
WITH "ranked_active_tables" AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "regionId", "serviceTypeId", "companyId"
            ORDER BY "createdAt" DESC, "id" DESC
        ) AS "position"
    FROM "pricing_tables"
    WHERE "active" = true
)
UPDATE "pricing_tables" AS "pricing"
SET "active" = false
FROM "ranked_active_tables" AS "ranked"
WHERE "pricing"."id" = "ranked"."id"
  AND "ranked"."position" > 1;

-- PostgreSQL treats NULL values as distinct in a regular unique index, so
-- global and company-specific scopes need separate partial unique indexes.
CREATE UNIQUE INDEX "pricing_tables_active_global_scope_key"
ON "pricing_tables"("regionId", "serviceTypeId")
WHERE "active" = true AND "companyId" IS NULL;

CREATE UNIQUE INDEX "pricing_tables_active_company_scope_key"
ON "pricing_tables"("regionId", "serviceTypeId", "companyId")
WHERE "active" = true AND "companyId" IS NOT NULL;
