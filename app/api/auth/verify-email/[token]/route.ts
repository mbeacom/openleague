import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { consumeVerificationToken } from "@/lib/auth/tokens";

/**
 * Email-verification landing endpoint. The emailed link carries a raw
 * single-use token (hashed at rest); consuming it marks the account's email
 * verified and sends the user to the login page.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const consumed = await consumeVerificationToken(token, "EMAIL_VERIFICATION");
    if (!consumed) {
      return NextResponse.redirect(
        new URL("/login?error=verification_invalid", request.url)
      );
    }

    // Guarded update: never regress an already-verified timestamp.
    await prisma.user.updateMany({
      where: { id: consumed.userId, emailVerified: null },
      data: { emailVerified: new Date() },
    });

    return NextResponse.redirect(new URL("/login?verified=1", request.url));
  } catch (error) {
    console.error("Error verifying email:", error);
    return NextResponse.redirect(
      new URL("/login?error=verification_invalid", request.url)
    );
  }
}
