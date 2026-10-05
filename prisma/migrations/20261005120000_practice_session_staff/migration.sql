-- Practice staff: a per-practice staff list and who runs each row.
-- Hand-written and additive: the dev database is behind on migrations, so
-- `migrate dev` cannot be used. It creates two tables and touches nothing else.
-- Prisma models neither the CHECK constraints nor the unique index on
-- lower("name"): keep them by hand if these tables are ever regenerated.

-- CreateTable
CREATE TABLE "practice_session_staff" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "teamOfficialId" TEXT,
    "userId" TEXT,

    CONSTRAINT "practice_session_staff_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "practice_session_staff_name_check" CHECK (char_length("name") BETWEEN 1 AND 60),
    CONSTRAINT "practice_session_staff_position_check" CHECK ("position" >= 0),
    CONSTRAINT "practice_session_staff_link_check" CHECK (num_nonnulls("teamOfficialId", "userId") <= 1)
);

-- CreateTable
CREATE TABLE "practice_session_play_staff" (
    "playRowId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "practice_session_play_staff_pkey" PRIMARY KEY ("playRowId", "staffId"),
    CONSTRAINT "practice_session_play_staff_position_check" CHECK ("position" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "practice_session_staff_sessionId_position_key" ON "practice_session_staff"("sessionId", "position");

-- CreateIndex: names are unique per practice ignoring case (an expression index Prisma can't model)
CREATE UNIQUE INDEX "practice_session_staff_sessionId_lower_name_key" ON "practice_session_staff"("sessionId", lower("name"));

-- CreateIndex
CREATE INDEX "practice_session_staff_teamOfficialId_idx" ON "practice_session_staff"("teamOfficialId");

-- CreateIndex
CREATE INDEX "practice_session_staff_userId_idx" ON "practice_session_staff"("userId");

-- CreateIndex
CREATE INDEX "practice_session_play_staff_staffId_idx" ON "practice_session_play_staff"("staffId");

-- AddForeignKey
ALTER TABLE "practice_session_staff" ADD CONSTRAINT "practice_session_staff_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "practice_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_session_staff" ADD CONSTRAINT "practice_session_staff_teamOfficialId_fkey" FOREIGN KEY ("teamOfficialId") REFERENCES "team_officials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_session_staff" ADD CONSTRAINT "practice_session_staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_session_play_staff" ADD CONSTRAINT "practice_session_play_staff_playRowId_fkey" FOREIGN KEY ("playRowId") REFERENCES "practice_session_plays"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_session_play_staff" ADD CONSTRAINT "practice_session_play_staff_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "practice_session_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
