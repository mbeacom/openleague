import { prisma } from "@/lib/db/prisma";

/**
 * How many of the team's practices use a library drill: sessions that still
 * reference it, plus sessions holding their own copy of it (sourcePlayId is
 * the copy's provenance). Call only with ids getPlayById has already accepted
 * for this team.
 */
export async function countPlayUsage(playId: string, teamId: string): Promise<number> {
    const rows = await prisma.practiceSessionPlay.findMany({
        where: {
            session: { teamId },
            OR: [{ playId }, { play: { sourcePlayId: playId } }],
        },
        select: { sessionId: true },
        distinct: ["sessionId"],
    });
    return rows.length;
}
