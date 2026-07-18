import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { consumeVerificationToken } from "@/lib/auth/tokens";
import { sendEmailChangedNoticeEmail } from "@/lib/email/templates";

/**
 * Email-change confirmation endpoint, clicked from the NEW address. Applies
 * the pending change recorded on the EMAIL_CHANGE token and notifies the old
 * address (a hijacked session must not be able to change email silently).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const consumed = await consumeVerificationToken(token, "EMAIL_CHANGE");
    if (!consumed || !consumed.newEmail) {
      return NextResponse.redirect(
        new URL("/login?error=verification_invalid", request.url)
      );
    }

    // The address may have been claimed since the request was made.
    const taken = await prisma.user.findUnique({
      where: { email: consumed.newEmail },
      select: { id: true },
    });
    if (taken && taken.id !== consumed.userId) {
      return NextResponse.redirect(
        new URL("/login?error=verification_invalid", request.url)
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: consumed.userId },
      select: { email: true, name: true },
    });
    if (!user) {
      return NextResponse.redirect(
        new URL("/login?error=verification_invalid", request.url)
      );
    }

    await prisma.user.update({
      where: { id: consumed.userId },
      data: { email: consumed.newEmail, emailVerified: new Date() },
    });

    try {
      await sendEmailChangedNoticeEmail({
        oldEmail: user.email,
        newEmail: consumed.newEmail,
        name: user.name,
      });
    } catch (noticeError) {
      console.error("Error sending email-changed notice:", noticeError);
    }

    return NextResponse.redirect(new URL("/login?message=email_changed", request.url));
  } catch (error) {
    console.error("Error confirming email change:", error);
    return NextResponse.redirect(
      new URL("/login?error=verification_invalid", request.url)
    );
  }
}
