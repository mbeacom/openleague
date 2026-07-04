"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireLeagueRole } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/actions/venue-organizations";
import type { ConnectStatus, OrganizationPaymentsOverview } from "@/lib/actions/venue-payments";
import {
  StripeDisabledError,
  createAccountLink,
  createLeagueConnectAccount,
  createLoginLink,
  isStripeEnabled,
  retrieveAccount,
} from "@/lib/payments/stripe";
import { computeRevenueSummary } from "@/lib/payments/revenue";
import { leaguePaymentCommandSchema, type LeaguePaymentCommandInput } from "@/lib/utils/validation";

/**
 * Stripe Connect onboarding for leagues/associations hosting paid signup
 * events. Thin mirror of the venue-organization flow (lib/actions/
 * venue-payments.ts) persisting to the League Connect columns.
 */

function onboardingPaths(leagueId: string) {
  return {
    refreshPath: `/league/${leagueId}/payments?onboarding=refresh`,
    returnPath: `/league/${leagueId}/payments?onboarding=complete`,
  };
}

function handleStripeError(error: unknown): ActionResult<never> {
  if (error instanceof StripeDisabledError) {
    return { success: false, error: error.message };
  }
  if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
    throw error;
  }
  if (error instanceof Error && error.message.startsWith("Unauthorized")) {
    return { success: false, error: error.message };
  }
  return { success: false, error: "Unable to reach Stripe. Please try again." };
}

function emptyStatus(configured: boolean): ConnectStatus {
  return {
    configured,
    accountId: null,
    chargesEnabled: false,
    payoutsEnabled: false,
    detailsSubmitted: false,
    onboardingComplete: false,
  };
}

/** Begin (or resume) Stripe Connect onboarding for a league. */
export async function startLeagueStripeOnboarding(
  input: LeaguePaymentCommandInput
): Promise<ActionResult<{ url: string }>> {
  try {
    const { leagueId } = leaguePaymentCommandSchema.parse(input);

    if (!isStripeEnabled()) {
      return { success: false, error: "Online payments are not configured for this environment." };
    }

    await requireLeagueRole(leagueId, "LEAGUE_ADMIN");

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true, name: true, contactEmail: true, isActive: true, stripeAccountId: true },
    });
    if (!league) {
      return { success: false, error: "League not found" };
    }
    if (!league.isActive) {
      return { success: false, error: "This league cannot accept payments." };
    }

    let accountId = league.stripeAccountId;
    if (!accountId) {
      const account = await createLeagueConnectAccount({
        leagueId: league.id,
        leagueName: league.name,
        email: league.contactEmail,
      });
      // Claim the account id only if none was set meanwhile (two admins
      // onboarding concurrently must not create duplicate Connect accounts).
      const claim = await prisma.league.updateMany({
        where: { id: league.id, stripeAccountId: null },
        data: { stripeAccountId: account.id },
      });
      if (claim.count === 0) {
        const current = await prisma.league.findUnique({
          where: { id: league.id },
          select: { stripeAccountId: true },
        });
        accountId = current?.stripeAccountId ?? account.id;
      } else {
        accountId = account.id;
      }
    }

    const link = await createAccountLink(accountId, onboardingPaths(leagueId));
    return { success: true, data: { url: link.url } };
  } catch (error) {
    return handleStripeError(error);
  }
}

/** Re-sync the league's connected-account capability flags from Stripe. */
export async function refreshLeagueStripeStatus(
  input: LeaguePaymentCommandInput
): Promise<ActionResult<ConnectStatus>> {
  try {
    const { leagueId } = leaguePaymentCommandSchema.parse(input);

    if (!isStripeEnabled()) {
      return { success: true, data: emptyStatus(false) };
    }

    await requireLeagueRole(leagueId, "LEAGUE_ADMIN");

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true, stripeAccountId: true },
    });
    if (!league) {
      return { success: false, error: "League not found" };
    }
    if (!league.stripeAccountId) {
      return { success: true, data: emptyStatus(true) };
    }

    const account = await retrieveAccount(league.stripeAccountId);
    const chargesEnabled = Boolean(account.charges_enabled);
    const payoutsEnabled = Boolean(account.payouts_enabled);
    const detailsSubmitted = Boolean(account.details_submitted);

    await prisma.league.update({
      where: { id: league.id },
      data: {
        stripeChargesEnabled: chargesEnabled,
        stripePayoutsEnabled: payoutsEnabled,
        stripeDetailsSubmitted: detailsSubmitted,
      },
    });

    revalidatePath(`/league/${leagueId}/payments`);

    return {
      success: true,
      data: {
        configured: true,
        accountId: league.stripeAccountId,
        chargesEnabled,
        payoutsEnabled,
        detailsSubmitted,
        onboardingComplete: chargesEnabled && detailsSubmitted,
      },
    };
  } catch (error) {
    return handleStripeError(error);
  }
}

/** One-time Stripe Express dashboard login link for an onboarded league. */
export async function getLeagueStripeDashboardLink(
  input: LeaguePaymentCommandInput
): Promise<ActionResult<{ url: string }>> {
  try {
    const { leagueId } = leaguePaymentCommandSchema.parse(input);
    await requireLeagueRole(leagueId, "LEAGUE_ADMIN");

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { stripeAccountId: true, stripeDetailsSubmitted: true },
    });
    if (!league?.stripeAccountId || !league.stripeDetailsSubmitted) {
      return { success: false, error: "Complete Stripe onboarding first." };
    }

    const link = await createLoginLink(league.stripeAccountId);
    return { success: true, data: { url: link.url } };
  } catch (error) {
    return handleStripeError(error);
  }
}

/** Read-only payments overview for the league payments page (stored flags only). */
export async function getLeaguePaymentsOverview(
  leagueId: string
): Promise<ActionResult<OrganizationPaymentsOverview>> {
  try {
    await requireLeagueRole(leagueId, "LEAGUE_ADMIN");

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: {
        stripeAccountId: true,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        stripeDetailsSubmitted: true,
      },
    });
    if (!league) {
      return { success: false, error: "League not found" };
    }

    const revenue = await computeRevenueSummary({ leagueId });

    return {
      success: true,
      data: {
        status: {
          configured: isStripeEnabled(),
          accountId: league.stripeAccountId,
          chargesEnabled: league.stripeChargesEnabled,
          payoutsEnabled: league.stripePayoutsEnabled,
          detailsSubmitted: league.stripeDetailsSubmitted,
          onboardingComplete: league.stripeChargesEnabled && league.stripeDetailsSubmitted,
        },
        revenue: { ...revenue, currency: "USD" },
      },
    };
  } catch (error) {
    return handleStripeError(error);
  }
}
