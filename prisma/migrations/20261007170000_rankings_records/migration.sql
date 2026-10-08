-- Hosted rankings (ADR-0025): a signed-in user's private rankings documents.
-- Additive only: one new table, owned by "User" and deleted with it.

-- CreateTable
CREATE TABLE "rankings_records" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "document" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rankings_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rankings_records_ownerId_updatedAt_idx" ON "rankings_records"("ownerId", "updatedAt");

-- AddForeignKey
ALTER TABLE "rankings_records" ADD CONSTRAINT "rankings_records_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
