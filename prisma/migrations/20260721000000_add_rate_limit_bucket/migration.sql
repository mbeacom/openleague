-- Durable fixed-window rate limiting for Server Actions (Track 2, H7).
--
-- The existing limiters are per-instance in-memory Maps applied by proxy.ts
-- to /api/* paths only; Server Actions POST to page URLs and reach production
-- unthrottled once serverless instances cold-start or scale out. This table
-- backs lib/utils/durable-rate-limit.ts: one row per (key, window),
-- incremented atomically via INSERT .. ON CONFLICT, with opportunistic
-- deletion of expired rows keeping the table bounded.

-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateIndex
CREATE INDEX "rate_limit_buckets_expiresAt_idx" ON "rate_limit_buckets"("expiresAt");
