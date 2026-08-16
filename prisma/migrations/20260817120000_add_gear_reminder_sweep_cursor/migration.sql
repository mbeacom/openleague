CREATE TABLE "gear_reminder_sweeps" (
  "id" TEXT NOT NULL,
  "cursorId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "gear_reminder_sweeps_pkey" PRIMARY KEY ("id")
);
