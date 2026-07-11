import { notFound } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { getVenueScheduleAdminData } from "@/lib/actions/venue-schedules";
import { prisma } from "@/lib/db/prisma";
import { getWholeSurfaceDefaultLabel } from "@/lib/utils/segment-presets";
import { segmentGeometrySchema } from "@/lib/utils/validation";
import {
  SurfaceManager,
  type OperatingHourView,
  type SurfaceAdminView,
} from "@/components/features/venue-admin/SurfaceManager";
import type { CoexistencePair, SegmentGeometry } from "@/types/segments";

interface VenueSurfacesPageProps {
  params: Promise<{
    organizationId: string;
    venueId: string;
  }>;
}

/** Geometry is written only through validated paths; fall back defensively. */
function toGeometry(value: unknown): SegmentGeometry {
  const parsed = segmentGeometrySchema.safeParse(value);
  return parsed.success ? parsed.data : { x: 0, y: 0, w: 1, h: 1, rotation: 0 };
}

export default async function VenueSurfacesPage({ params }: VenueSurfacesPageProps) {
  const { organizationId, venueId } = await params;

  // Auth gate (requireVenueScheduleManager + org/venue match) — the page's
  // existing pattern; the richer segmentation data is loaded below.
  const adminData = await getVenueScheduleAdminData(organizationId, venueId);
  if (!adminData.success) {
    notFound();
  }

  const [surfaceRows, hourRows, pairRows] = await Promise.all([
    // All surfaces, including archived ones (staff can restore them).
    prisma.iceSurface.findMany({
      where: { venueId },
      select: {
        id: true,
        name: true,
        surfaceType: true,
        capacity: true,
        notes: true,
        isDefault: true,
        isActive: true,
        displayOrder: true,
        wholeLabel: true,
        segments: {
          select: {
            id: true,
            name: true,
            kind: true,
            presetRole: true,
            isActive: true,
            geometry: true,
          },
          orderBy: [{ createdAt: "asc" }, { name: "asc" }],
        },
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    }),
    prisma.venueOperatingHour.findMany({
      where: { venueId },
      select: {
        id: true,
        dayOfWeek: true,
        opensAt: true,
        closesAt: true,
        status: true,
        label: true,
        surfaceId: true,
      },
      orderBy: [{ dayOfWeek: "asc" }, { opensAt: "asc" }],
    }),
    // Both segments of a pair share a surface (validation invariant), so
    // filtering on segmentA is sufficient.
    prisma.segmentCoexistence.findMany({
      where: { segmentA: { surface: { venueId } } },
      select: { segmentAId: true, segmentBId: true },
    }),
  ]);

  const surfaceIdBySegment = new Map<string, string>();
  for (const surface of surfaceRows) {
    for (const segment of surface.segments) {
      surfaceIdBySegment.set(segment.id, surface.id);
    }
  }

  const pairsBySurface = new Map<string, CoexistencePair[]>();
  for (const pair of pairRows) {
    const surfaceId = surfaceIdBySegment.get(pair.segmentAId);
    if (!surfaceId) continue;
    const list = pairsBySurface.get(surfaceId) ?? [];
    list.push({ segmentAId: pair.segmentAId, segmentBId: pair.segmentBId });
    pairsBySurface.set(surfaceId, list);
  }

  const surfaces: SurfaceAdminView[] = surfaceRows.map((surface) => ({
    id: surface.id,
    name: surface.name,
    surfaceType: surface.surfaceType,
    capacity: surface.capacity,
    notes: surface.notes,
    isDefault: surface.isDefault,
    isActive: surface.isActive,
    displayOrder: surface.displayOrder,
    customWholeLabel: surface.wholeLabel,
    wholeLabel: surface.wholeLabel ?? getWholeSurfaceDefaultLabel(surface.surfaceType),
    segments: surface.segments.map((segment) => ({
      id: segment.id,
      name: segment.name,
      kind: segment.kind,
      presetRole: segment.presetRole,
      isActive: segment.isActive,
      geometry: toGeometry(segment.geometry),
    })),
    coexistence: pairsBySurface.get(surface.id) ?? [],
  }));

  const operatingHours: OperatingHourView[] = hourRows;

  return (
    <PageContainer>
      <PageHeader title="Surfaces and Operating Hours" />
      <SurfaceManager
        organizationId={organizationId}
        venueId={venueId}
        surfaces={surfaces}
        operatingHours={operatingHours}
      />
    </PageContainer>
  );
}
