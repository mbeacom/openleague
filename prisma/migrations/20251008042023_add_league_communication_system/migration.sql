-- CreateEnum
CREATE TYPE "LeagueMessageType" AS ENUM ('MESSAGE', 'ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "MessagePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "MessageDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "league_messages" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "messageType" "LeagueMessageType" NOT NULL DEFAULT 'MESSAGE',
    "priority" "MessagePriority" NOT NULL DEFAULT 'NORMAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leagueId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,

    CONSTRAINT "league_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_targeting" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "entireLeague" BOOLEAN NOT NULL DEFAULT false,
    "divisionId" TEXT,
    "teamId" TEXT,

    CONSTRAINT "message_targeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_recipients" (
    "id" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryStatus" "MessageDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "message_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "league_messages_leagueId_createdAt_idx" ON "league_messages"("leagueId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "message_recipients_messageId_userId_key" ON "message_recipients"("messageId", "userId");

-- AddForeignKey
ALTER TABLE "league_messages" ADD CONSTRAINT "league_messages_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_messages" ADD CONSTRAINT "league_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_targeting" ADD CONSTRAINT "message_targeting_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "league_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_targeting" ADD CONSTRAINT "message_targeting_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_targeting" ADD CONSTRAINT "message_targeting_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "league_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
