"use server";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUserId } from "@/lib/auth/session";
import { entityLogoPrefix, isOwnedBlobUrl } from "@/lib/media/blob";
import { fetchLogoBytes, normalizeLogoBytes } from "@/lib/media/logo-image";
import { parseId } from "@/lib/utils/ids";
import { canViewPracticeSession } from "@/lib/utils/practice-access";
import type { LogoImage } from "@/types/practice-planner";

/**
 * The team logo for a practice's bench sheet exports (practice logo spec R1):
 * a PNG data URL within 512×512, or null, and the export draws the team's
 * Crest instead. Readable by whoever can read the practice (the detail read's
 * rule). Only the team's own blob objects are fetched; the URL never leaves
 * the server. Every failure is null, and a log line names the error type only.
 */
export async function getPracticeLogoImage(sessionId: string): Promise<LogoImage | null> {
    const id = parseId(sessionId);
    if (!id) return null;
    try {
        const userId = await getCurrentUserId();
        if (!userId) return null;

        const session = await prisma.practiceSession.findUnique({
            where: { id },
            select: { teamId: true, isShared: true, team: { select: { logoUrl: true } } },
        });
        if (!session) return null;
        const membership = await prisma.teamMember.findFirst({
            where: { userId, teamId: session.teamId },
            select: { role: true },
        });
        if (!canViewPracticeSession(membership?.role, session.isShared)) return null;

        const url = session.team.logoUrl;
        if (!url || !isOwnedBlobUrl(url, entityLogoPrefix("team", session.teamId))) return null;
        const bytes = await fetchLogoBytes(url);
        if (!bytes) {
            console.warn("Practice logo unavailable: the response failed or was over the size cap");
            return null;
        }
        const logo = await normalizeLogoBytes(bytes);
        if (!logo) console.warn("Practice logo unavailable: not a PNG, JPEG or WebP image, or too large once normalized");
        return logo;
    } catch (error) {
        console.warn("Practice logo unavailable:", error instanceof Error ? error.name : "unknown error");
        return null;
    }
}
