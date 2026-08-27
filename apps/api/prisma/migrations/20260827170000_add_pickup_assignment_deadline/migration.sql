-- Additive rollout: existing assignments keep the rule disabled until a new
-- acceptance freezes a deadline using the admin setting.
ALTER TABLE "platform_settings"
ADD COLUMN "pickupAssignmentTimeoutMinutes" INTEGER;

ALTER TABLE "deliveries"
ADD COLUMN "pickupDeadlineAt" TIMESTAMP(3);

CREATE INDEX "deliveries_status_pickupDeadlineAt_idx"
ON "deliveries"("status", "pickupDeadlineAt");
