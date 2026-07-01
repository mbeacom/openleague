-- AlterEnum
ALTER TYPE "RegistrationMode" ADD VALUE 'SELF_REGISTER';

-- CreateEnum
CREATE TYPE "SessionRegistrationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'WAITLISTED', 'CANCELED', 'REFUNDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('FREE', 'REQUIRES_PAYMENT', 'PROCESSING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELED');

-- AlterTable
ALTER TABLE "venue_organizations"
    ADD COLUMN "stripeAccountId" TEXT,
    ADD COLUMN "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "stripeDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "platformFeeBps" INTEGER;

-- CreateTable
CREATE TABLE "session_registrations" (
    "id" TEXT NOT NULL,
    "status" "SessionRegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "participantName" TEXT NOT NULL,
    "participantEmail" TEXT NOT NULL,
    "participantPhone" TEXT,
    "skillLevelNote" TEXT,
    "notes" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitAmount" INTEGER NOT NULL DEFAULT 0,
    "amountTotal" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "confirmedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "venueId" TEXT NOT NULL,
    "scheduleBlockId" TEXT,
    "lessonOfferingId" TEXT,
    "userId" TEXT NOT NULL,
    "canceledById" TEXT,

    CONSTRAINT "session_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'REQUIRES_PAYMENT',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "applicationFeeAmount" INTEGER NOT NULL DEFAULT 0,
    "refundedAmount" INTEGER NOT NULL DEFAULT 0,
    "stripeAccountId" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "receiptUrl" TEXT,
    "failureReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "registrationId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "venue_organizations_stripeAccountId_key" ON "venue_organizations"("stripeAccountId");

-- CreateIndex
CREATE INDEX "session_registrations_venueId_status_idx" ON "session_registrations"("venueId", "status");

-- CreateIndex
CREATE INDEX "session_registrations_scheduleBlockId_status_idx" ON "session_registrations"("scheduleBlockId", "status");

-- CreateIndex
CREATE INDEX "session_registrations_lessonOfferingId_status_idx" ON "session_registrations"("lessonOfferingId", "status");

-- CreateIndex
CREATE INDEX "session_registrations_userId_idx" ON "session_registrations"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripeCheckoutSessionId_key" ON "payments"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripePaymentIntentId_key" ON "payments"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_registrationId_key" ON "payments"("registrationId");

-- CreateIndex
CREATE INDEX "payments_organizationId_status_idx" ON "payments"("organizationId", "status");

-- CreateIndex
CREATE INDEX "payments_venueId_status_idx" ON "payments"("venueId", "status");

-- CreateIndex
CREATE INDEX "payments_stripePaymentIntentId_idx" ON "payments"("stripePaymentIntentId");

-- AddForeignKey
ALTER TABLE "session_registrations" ADD CONSTRAINT "session_registrations_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_registrations" ADD CONSTRAINT "session_registrations_scheduleBlockId_fkey" FOREIGN KEY ("scheduleBlockId") REFERENCES "venue_schedule_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_registrations" ADD CONSTRAINT "session_registrations_lessonOfferingId_fkey" FOREIGN KEY ("lessonOfferingId") REFERENCES "lesson_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_registrations" ADD CONSTRAINT "session_registrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_registrations" ADD CONSTRAINT "session_registrations_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "session_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "venue_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
