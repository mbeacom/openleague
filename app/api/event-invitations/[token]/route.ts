import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { getBaseUrl } from "@/lib/env";

/**
 * Event invitation accept link. Signed-in invitees land on the event ready to
 * register; known-but-signed-out invitees go to login; unknown addresses go to
 * signup. Acceptance (and account binding) is recorded on first use.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const baseUrl = getBaseUrl();

  const invitation = await prisma.eventInvitation.findUnique({
    where: { token },
    select: {
      id: true,
      email: true,
      status: true,
      expiresAt: true,
      invitedUserId: true,
      event: { select: { id: true, status: true } },
    },
  });

  if (!invitation || invitation.status === "REVOKED") {
    return NextResponse.redirect(`${baseUrl}/signups?invitation=invalid`);
  }
  if (invitation.expiresAt <= new Date() || invitation.event.status === "CANCELED") {
    return NextResponse.redirect(`${baseUrl}/signups?invitation=expired`);
  }

  const eventUrl = `${baseUrl}/signups/${invitation.event.id}`;
  const session = await auth();
  const sessionEmail = session?.user?.email?.toLowerCase() ?? null;

  if (session?.user) {
    // Bind the invitation to the signed-in account when the address matches
    // (or it was pre-bound); record acceptance either way it is used.
    const matches =
      sessionEmail === invitation.email.toLowerCase() ||
      (invitation.invitedUserId && session.user.id === invitation.invitedUserId);
    if (matches) {
      await prisma.eventInvitation.update({
        where: { id: invitation.id },
        data: {
          status: "ACCEPTED",
          acceptedAt: invitation.status === "ACCEPTED" ? undefined : new Date(),
          invitedUserId: invitation.invitedUserId ?? session.user.id ?? undefined,
        },
      });
    }
    return NextResponse.redirect(eventUrl);
  }

  // Not signed in: known accounts log in, new people sign up. Either way they
  // return through this link so acceptance gets recorded.
  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: invitation.email, mode: "insensitive" } },
    select: { id: true },
  });
  const callbackUrl = encodeURIComponent(`/api/event-invitations/${token}`);
  if (existingUser) {
    return NextResponse.redirect(`${baseUrl}/login?callbackUrl=${callbackUrl}`);
  }
  return NextResponse.redirect(
    `${baseUrl}/signup?email=${encodeURIComponent(invitation.email)}&callbackUrl=${callbackUrl}`
  );
}
