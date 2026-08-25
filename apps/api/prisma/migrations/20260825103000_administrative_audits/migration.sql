CREATE TABLE "administrative_audits" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "entityType" VARCHAR(40) NOT NULL,
    "entityId" VARCHAR(80) NOT NULL,
    "summary" VARCHAR(500) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "administrative_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "administrative_audits_createdAt_idx"
ON "administrative_audits"("createdAt");

CREATE INDEX "administrative_audits_actorUserId_createdAt_idx"
ON "administrative_audits"("actorUserId", "createdAt");

CREATE INDEX "administrative_audits_entityType_entityId_createdAt_idx"
ON "administrative_audits"("entityType", "entityId", "createdAt");

ALTER TABLE "administrative_audits"
ADD CONSTRAINT "administrative_audits_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
