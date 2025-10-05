-- CreateIndex
CREATE INDEX "Event_teamId_startAt_idx" ON "Event"("teamId", "startAt");

-- CreateIndex
CREATE INDEX "Event_startAt_idx" ON "Event"("startAt");
