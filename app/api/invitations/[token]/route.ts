import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    // Find the invitation by token
    const invitation = await prisma.invitation.findUnique({
      where: { token },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            sport: true,
            season: true,
          },
        },
      },
    });

    // Check if invitation exists
    if (!invitation) {
      return NextResponse.redirect(
        new URL("/login?error=invalid_invitation", request.url)
      );
    }

    // Check if invitation has expired
    if (invitation.expiresAt < new Date()) {
      // Mark as expired
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });

      return NextResponse.redirect(
        new URL("/login?error=invitation_expired", request.url)
      );
    }

    // Check if invitation has already been accepted
    if (invitation.status === "ACCEPTED") {
      return NextResponse.redirect(
        new URL("/login?message=already_accepted", request.url)
      );
    }

    // Redirect to signup page with pre-filled team information
    const signupUrl = new URL("/signup", request.url);
    signupUrl.searchParams.set("email", invitation.email);
    signupUrl.searchParams.set("teamId", invitation.team.id);
    signupUrl.searchParams.set("teamName", invitation.team.name);
    signupUrl.searchParams.set("invitationToken", token);

    return NextResponse.redirect(signupUrl);
  } catch (error) {
    console.error("Error processing invitation:", error);
    return NextResponse.redirect(
      new URL("/login?error=invitation_error", request.url)
    );
  }
}
