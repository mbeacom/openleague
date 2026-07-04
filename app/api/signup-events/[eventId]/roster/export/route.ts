import { prisma } from "@/lib/db/prisma";
import { getCurrentUserId, isEventManager } from "@/lib/auth/session";
import { toCsvContent } from "@/lib/utils/csv";
import { formatDateTime } from "@/lib/utils/date";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;

    const userId = await getCurrentUserId();
    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }
    const manager = await isEventManager(userId, eventId);
    if (!manager) {
      return new Response("Forbidden", { status: 403 });
    }

    const event = await prisma.signupEvent.findUnique({
      where: { id: eventId },
      select: { title: true },
    });
    if (!event) {
      return new Response("Not Found", { status: 404 });
    }

    const registrations = await prisma.eventRegistration.findMany({
      where: { eventId },
      orderBy: [{ slot: { sortOrder: "asc" } }, { createdAt: "asc" }],
      select: {
        participantName: true,
        participantEmail: true,
        participantPhone: true,
        status: true,
        manualPaymentStatus: true,
        unitAmount: true,
        currency: true,
        checkedInAt: true,
        notes: true,
        createdAt: true,
        slot: { select: { name: true } },
        registrant: { select: { name: true, email: true } },
        payment: { select: { status: true } },
      },
    });

    const headers = [
      "Slot",
      "Participant",
      "Status",
      "Registered By",
      "Contact Email",
      "Contact Phone",
      "Payment",
      "Amount",
      "Checked In",
      "Registered At",
      "Notes",
    ];
    const rows = registrations.map((registration) => [
      registration.slot.name,
      registration.participantName,
      registration.status,
      registration.registrant.name ?? registration.registrant.email,
      registration.participantEmail ?? registration.registrant.email,
      registration.participantPhone ?? "",
      registration.payment?.status ?? registration.manualPaymentStatus,
      registration.unitAmount > 0
        ? `${(registration.unitAmount / 100).toFixed(2)} ${registration.currency}`
        : "Free",
      registration.checkedInAt ? formatDateTime(registration.checkedInAt) : "",
      formatDateTime(registration.createdAt),
      registration.notes ?? "",
    ]);

    const csv = toCsvContent(headers, rows);
    const safeTitle = event.title.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-").toLowerCase();

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeTitle || "event"}-roster.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Failed to export event roster:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
