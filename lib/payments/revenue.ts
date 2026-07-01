import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export type RevenueSummary = {
  paidCount: number;
  grossCents: number;
  refundedCents: number;
  platformFeeCents: number;
  netCents: number;
};

/**
 * Compute a revenue summary for payments matching `where`. Includes fully
 * REFUNDED payments so gross and refunded totals reflect reality; the platform
 * application fee is only counted as retained on payments that were not fully
 * refunded (a full refund reverses the application fee back to the rink).
 */
export async function computeRevenueSummary(where: Prisma.PaymentWhereInput): Promise<RevenueSummary> {
  const [captured, retainedFee] = await Promise.all([
    prisma.payment.aggregate({
      where: { ...where, status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] } },
      _sum: { amount: true, refundedAmount: true },
      _count: true,
    }),
    prisma.payment.aggregate({
      where: { ...where, status: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
      _sum: { applicationFeeAmount: true },
    }),
  ]);

  const grossCents = captured._sum.amount ?? 0;
  const refundedCents = captured._sum.refundedAmount ?? 0;
  const platformFeeCents = retainedFee._sum.applicationFeeAmount ?? 0;

  return {
    paidCount: captured._count,
    grossCents,
    refundedCents,
    platformFeeCents,
    netCents: grossCents - refundedCents - platformFeeCents,
  };
}
