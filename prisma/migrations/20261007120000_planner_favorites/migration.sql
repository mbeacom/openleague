-- Practice planner favorites (practice favorites spec R1).
-- Hand-written and additive: the dev database is behind on migrations, so
-- `migrate dev` cannot be used. A new enum and a new table; nothing existing
-- changes. targetId has no foreign key on purpose: it points at a library
-- play, a starter drill's stable id, or a practice session (spec R4).

-- CreateEnum
CREATE TYPE "PlannerFavoriteKind" AS ENUM ('DRILL', 'PRACTICE');

-- CreateTable
CREATE TABLE "planner_favorites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "PlannerFavoriteKind" NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planner_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "planner_favorites_userId_kind_targetId_key" ON "planner_favorites"("userId", "kind", "targetId");

-- AddForeignKey
ALTER TABLE "planner_favorites" ADD CONSTRAINT "planner_favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
