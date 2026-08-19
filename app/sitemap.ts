import { MetadataRoute } from 'next';

import { prisma } from '@/lib/db/prisma';
import {
    publicPublishedAssociationWhere,
    publicPublishedTeamWhere,
    publicContentWhere,
} from '@/lib/utils/public-associations';

/**
 * Dynamic sitemap generation for OpenLeague
 * https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */
/**
 * Revalidated hourly rather than baked at build time.
 *
 * Sitemaps are cached by default, but this one now enumerates published
 * associations, teams, and news — all of which change between deploys. A
 * build-time snapshot would omit everything published since, and would also
 * freeze in whatever state the build-time database happened to be in (a
 * database still awaiting the migration yields an empty association list,
 * which the catch below turns into "no association pages" rather than a
 * failed build).
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const baseUrl = 'https://openl.app';
    const currentDate = new Date();

    // Static marketing pages
    const marketingPages = [
        {
            url: baseUrl,
            lastModified: currentDate,
            changeFrequency: 'weekly' as const,
            priority: 1.0,
        },
        {
            url: `${baseUrl}/features`,
            lastModified: currentDate,
            changeFrequency: 'monthly' as const,
            priority: 0.9,
        },
        {
            url: `${baseUrl}/pricing`,
            lastModified: currentDate,
            changeFrequency: 'monthly' as const,
            priority: 0.85,
        },
        {
            url: `${baseUrl}/get-started`,
            lastModified: currentDate,
            changeFrequency: 'monthly' as const,
            priority: 0.8,
        },
        {
            url: `${baseUrl}/contact`,
            lastModified: currentDate,
            changeFrequency: 'monthly' as const,
            priority: 0.7,
        },
        {
            url: `${baseUrl}/about`,
            lastModified: currentDate,
            changeFrequency: 'monthly' as const,
            priority: 0.6,
        },
        {
            url: `${baseUrl}/blog`,
            lastModified: currentDate,
            changeFrequency: 'weekly' as const,
            priority: 0.7,
        },
    ];

    // Documentation pages
    const docPages = [
        {
            url: `${baseUrl}/docs`,
            lastModified: currentDate,
            changeFrequency: 'weekly' as const,
            priority: 0.8,
        },
        {
            url: `${baseUrl}/docs/user-guide`,
            lastModified: currentDate,
            changeFrequency: 'weekly' as const,
            priority: 0.7,
        },
        {
            url: `${baseUrl}/docs/guides`,
            lastModified: currentDate,
            changeFrequency: 'weekly' as const,
            priority: 0.7,
        },
        {
            url: `${baseUrl}/docs/api`,
            lastModified: currentDate,
            changeFrequency: 'weekly' as const,
            priority: 0.6,
        },
        {
            url: `${baseUrl}/docs/contributing`,
            lastModified: currentDate,
            changeFrequency: 'monthly' as const,
            priority: 0.6,
        },
    ];

    // Legal pages (lower priority, no index in metadata)
    const legalPages = [
        {
            url: `${baseUrl}/privacy`,
            lastModified: currentDate,
            changeFrequency: 'yearly' as const,
            priority: 0.3,
        },
        {
            url: `${baseUrl}/terms`,
            lastModified: currentDate,
            changeFrequency: 'yearly' as const,
            priority: 0.3,
        },
        {
            url: `${baseUrl}/security`,
            lastModified: currentDate,
            changeFrequency: 'yearly' as const,
            priority: 0.3,
        },
        {
            url: `${baseUrl}/cookies`,
            lastModified: currentDate,
            changeFrequency: 'yearly' as const,
            priority: 0.3,
        },
    ];

    // Published association surfaces (feature 007 US4). Every query is bounded
    // by the same published-only `where` the pages use, so an unpublished
    // association, team, or scheduled-but-not-yet-live post can never be
    // advertised here — the sitemap cannot leak what the pages would 404 on.
    const associationPages = await getPublishedAssociationPages(baseUrl, currentDate);

    return [...marketingPages, ...docPages, ...legalPages, ...associationPages];
}

/** Bounded so a large deployment cannot turn the sitemap into a table scan. */
const SITEMAP_LIMIT = 500;

async function getPublishedAssociationPages(
    baseUrl: string,
    currentDate: Date,
): Promise<MetadataRoute.Sitemap> {
    try {
        const now = new Date();
        const associations = await prisma.league.findMany({
            where: publicPublishedAssociationWhere,
            select: {
                slug: true,
                publishedAt: true,
                teams: {
                    where: publicPublishedTeamWhere,
                    select: { slug: true, publishedAt: true },
                    take: SITEMAP_LIMIT,
                },
                publicContentItems: {
                    where: publicContentWhere(now),
                    select: { slug: true, publishAt: true },
                    orderBy: { publishAt: 'desc' },
                    take: SITEMAP_LIMIT,
                },
            },
            take: SITEMAP_LIMIT,
        });

        return associations.flatMap((association) => {
            if (!association.slug) return [];
            const base = `${baseUrl}/associations/${association.slug}`;
            const lastModified = association.publishedAt ?? currentDate;

            return [
                { url: base, lastModified, changeFrequency: 'weekly' as const, priority: 0.7 },
                { url: `${base}/teams`, lastModified, changeFrequency: 'weekly' as const, priority: 0.6 },
                { url: `${base}/schedule`, lastModified, changeFrequency: 'daily' as const, priority: 0.6 },
                { url: `${base}/events`, lastModified, changeFrequency: 'daily' as const, priority: 0.6 },
                ...association.teams.flatMap((team) =>
                    team.slug
                        ? [{
                            url: `${base}/teams/${team.slug}`,
                            lastModified: team.publishedAt ?? lastModified,
                            changeFrequency: 'weekly' as const,
                            priority: 0.5,
                        }]
                        : [],
                ),
                ...association.publicContentItems.map((item) => ({
                    url: `${base}/news/${item.slug}`,
                    lastModified: item.publishAt ?? lastModified,
                    changeFrequency: 'monthly' as const,
                    priority: 0.4,
                })),
            ];
        });
    } catch (error) {
        // A sitemap that throws takes the whole route down. The static pages
        // are still worth serving if the database is unreachable.
        console.error('Sitemap: association pages unavailable', error);
        return [];
    }
}
