"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireVenueStaffRole, VENUE_STAFF_ADMIN_ROLES } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/actions/venue-organizations";
import {
  connectOnboardingSchema,
  type ConnectOnboardingInput,
} from "@/lib/utils/validation";
import {
  StripeDisabledError,
  createAccountLink,
  createConnectAccount,
  createLoginLink,
  isStripeEnabled,
  retrieveAccount,
} from "@/lib/payments/stripe";
import { computeRevenueSummary } from "@/lib/payments/revenue";

export type ConnectStatus = {
  configured: boolean;
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  onboardingComplete: boolean;
};

function onboardingPaths(organizationId: string) {
  return {
    refreshPath: `/venue-admin/${organizationId}/payments?onboarding=refresh`,
    returnPath: `/venue-admin/${organizationId}/payments?onboarding=complete`,
  };
}

function handleStripeError(error: unknown): ActionResult<never> {
  if (error instanceof StripeDisabledError) {
    return { success: false, error: error.message };
  }
  if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
    throw error;
  }
  return { success: false, error: "Unable to reach Stripe. Please try again." };
}

/**
 * Begin (or resume) Stripe Connect onboarding for a venue organization.
 * Creates the connected account on first use and returns a hosted onboarding URL.
 */
export async function startStripeOnboarding(
  input: ConnectOnboardingInput
): Promise<ActionResult<{ url: string }>> {
  try {
    const { organizationId } = connectOnboardingSchema.parse(input);

    if (!isStripeEnabled()) {
      return { success: false, error: "Online payments are not configured for this environment." };
    }

    await requireVenueStaffRole(organizationId, VENUE_STAFF_ADMIN_ROLES);

    const organization = await prisma.venueOrganization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        primaryContactEmail: true,
        status: true,
        stripeAccountId: true,
      },
    });

    if (!organization) {
      return { success: false, error: "Organization not found" };
    }

    if (organization.status === "ARCHIVED" || organization.status === "SUSPENDED") {
      return { success: false, error: "This organization cannot accept payments." };
    }

    let accountId = organization.stripeAccountId;

    if (!accountId) {
      const account = await createConnectAccount({
        organizationId: organization.id,
        organizationName: organization.name,
        email: organization.primaryContactEmail,
      });
      // Claim the account id only if none was set meanwhile (guards against two
      // admins onboarding concurrently and creating duplicate Connect accounts).
      const claim = await prisma.venueOrganization.updateMany({
        where: { id: organization.id, stripeAccountId: null },
        data: { stripeAccountId: account.id },
      });
      if (claim.count === 0) {
        // Another request won the race; use the already-stored account.
        const current = await prisma.venueOrganization.findUnique({
          where: { id: organization.id },
          select: { stripeAccountId: true },
        });
        accountId = current?.stripeAccountId ?? account.id;
      } else {
        accountId = account.id;
      }
    }

    const link = await createAccountLink(accountId, onboardingPaths(organizationId));
    return { success: true, data: { url: link.url } };
  } catch (error) {
    return handleStripeError(error);
  }
}

/**
 * Re-sync the connected account's capability flags from Stripe. Called when a
 * rink returns from onboarding and from the payments admin page.
 */
export async function refreshStripeAccountStatus(
  input: ConnectOnboardingInput
): Promise<ActionResult<ConnectStatus>> {
  try {
    const { organizationId } = connectOnboardingSchema.parse(input);

    if (!isStripeEnabled()) {
      return { success: true, data: emptyStatus(false) };
    }

    await requireVenueStaffRole(organizationId, VENUE_STAFF_ADMIN_ROLES);

    const organization = await prisma.venueOrganization.findUnique({
      where: { id: organizationId },
      select: { id: true, stripeAccountId: true },
    });

    if (!organization) {
      return { success: false, error: "Organization not found" };
    }

    if (!organization.stripeAccountId) {
      return { success: true, data: emptyStatus(true) };
    }

    const account = await retrieveAccount(organization.stripeAccountId);
    const chargesEnabled = Boolean(account.charges_enabled);
    const payoutsEnabled = Boolean(account.payouts_enabled);
    const detailsSubmitted = Boolean(account.details_submitted);

    await prisma.venueOrganization.update({
      where: { id: organization.id },
      data: {
        stripeChargesEnabled: chargesEnabled,
        stripePayoutsEnabled: payoutsEnabled,
        stripeDetailsSubmitted: detailsSubmitted,
      },
    });

    revalidatePath(`/venue-admin/${organizationId}/payments`);

    return {
      success: true,
      data: {
        configured: true,
        accountId: organization.stripeAccountId,
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

/**
 * Return a one-time Stripe Express dashboard login link for an onboarded rink.
 */
export async function getStripeDashboardLink(
  input: ConnectOnboardingInput
): Promise<ActionResult<{ url: string }>> {
  try {
    const { organizationId } = connectOnboardingSchema.parse(input);
    await requireVenueStaffRole(organizationId, VENUE_STAFF_ADMIN_ROLES);

    const organization = await prisma.venueOrganization.findUnique({
      where: { id: organizationId },
      select: { stripeAccountId: true, stripeDetailsSubmitted: true },
    });

    if (!organization?.stripeAccountId || !organization.stripeDetailsSubmitted) {
      return { success: false, error: "Complete Stripe onboarding first." };
    }

    const link = await createLoginLink(organization.stripeAccountId);
    return { success: true, data: { url: link.url } };
  } catch (error) {
    return handleStripeError(error);
  }
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

export type OrganizationPaymentsOverview = {
  status: ConnectStatus;
  revenue: {
    paidCount: number;
    grossCents: number;
    refundedCents: number;
    platformFeeCents: number;
    netCents: number;
    currency: string;
  };
};

/**
 * Read-only payments overview for the organization payments admin page. Uses the
 * stored Connect flags (no live Stripe call) so it is safe to call during render.
 */
export async function getOrganizationPaymentsOverview(
  organizationId: string
): Promise<ActionResult<OrganizationPaymentsOverview>> {
  try {
    await requireVenueStaffRole(organizationId, VENUE_STAFF_ADMIN_ROLES);

    const organization = await prisma.venueOrganization.findUnique({
      where: { id: organizationId },
      select: {
        stripeAccountId: true,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        stripeDetailsSubmitted: true,
      },
    });

    if (!organization) {
      return { success: false, error: "Organization not found" };
    }

    const revenue = await computeRevenueSummary({ organizationId });

    return {
      success: true,
      data: {
        status: {
          configured: isStripeEnabled(),
          accountId: organization.stripeAccountId,
          chargesEnabled: organization.stripeChargesEnabled,
          payoutsEnabled: organization.stripePayoutsEnabled,
          detailsSubmitted: organization.stripeDetailsSubmitted,
          onboardingComplete: organization.stripeChargesEnabled && organization.stripeDetailsSubmitted,
        },
        revenue: {
          ...revenue,
          currency: "USD",
        },
      },
    };
  } catch (error) {
    return handleStripeError(error);
  }
}
