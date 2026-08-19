import { describe, it, expect, vi } from 'vitest';

const { mockLeague } = vi.hoisted(() => ({ mockLeague: { findMany: vi.fn() } }));

// The sitemap now enumerates published association surfaces. Default to none so
// the existing static-page assertions stay about the static pages.
vi.mock('@/lib/db/prisma', () => ({ prisma: { league: mockLeague } }));
mockLeague.findMany.mockResolvedValue([]);

import sitemap from '@/app/sitemap';

describe('Sitemap Generation', () => {
    it('should generate a valid sitemap array', async () => {
        const sitemapData = await sitemap();

        expect(Array.isArray(sitemapData)).toBe(true);
        expect(sitemapData.length).toBeGreaterThan(0);
    });

    it('should include homepage with highest priority', async () => {
        const sitemapData = await sitemap();
        const homepage = sitemapData.find((entry) => entry.url === 'https://openl.app');

        expect(homepage).toBeDefined();
        expect(homepage?.priority).toBe(1.0);
        expect(homepage?.changeFrequency).toBe('weekly');
    });

    it('should include all marketing pages', async () => {
        const sitemapData = await sitemap();
        const urls = sitemapData.map((entry) => entry.url);

        expect(urls).toContain('https://openl.app/features');
        expect(urls).toContain('https://openl.app/pricing');
        expect(urls).toContain('https://openl.app/get-started');
        expect(urls).toContain('https://openl.app/contact');
        expect(urls).toContain('https://openl.app/about');
    });

    it('should include documentation pages', async () => {
        const sitemapData = await sitemap();
        const urls = sitemapData.map((entry) => entry.url);

        expect(urls).toContain('https://openl.app/docs');
        expect(urls).toContain('https://openl.app/docs/user-guide');
        expect(urls).toContain('https://openl.app/docs/guides');
        expect(urls).toContain('https://openl.app/docs/api');
        expect(urls).toContain('https://openl.app/docs/contributing');
    });

    it('should include legal pages with lower priority', async () => {
        const sitemapData = await sitemap();
        const privacyPage = sitemapData.find((entry) => entry.url === 'https://openl.app/privacy');
        const termsPage = sitemapData.find((entry) => entry.url === 'https://openl.app/terms');

        expect(privacyPage).toBeDefined();
        expect(termsPage).toBeDefined();
        expect(privacyPage?.priority).toBe(0.3);
        expect(termsPage?.priority).toBe(0.3);
    });

    it('should set appropriate priorities for different page types', async () => {
        const sitemapData = await sitemap();
        const homepage = sitemapData.find((entry) => entry.url === 'https://openl.app');
        const featuresPage = sitemapData.find((entry) => entry.url === 'https://openl.app/features');
        const legalPage = sitemapData.find((entry) => entry.url === 'https://openl.app/privacy');

        expect(homepage?.priority).toBeGreaterThan(featuresPage?.priority || 0);
        expect(featuresPage?.priority).toBeGreaterThan(legalPage?.priority || 0);
    });

    it('should set appropriate change frequencies', async () => {
        const sitemapData = await sitemap();
        const homepage = sitemapData.find((entry) => entry.url === 'https://openl.app');
        const legalPage = sitemapData.find((entry) => entry.url === 'https://openl.app/privacy');

        expect(homepage?.changeFrequency).toBe('weekly');
        expect(legalPage?.changeFrequency).toBe('yearly');
    });

    it('should include lastModified dates for all entries', async () => {
        const sitemapData = await sitemap();

        sitemapData.forEach((entry) => {
            expect(entry.lastModified).toBeInstanceOf(Date);
        });
    });

    it('should use correct base URL', async () => {
        const sitemapData = await sitemap();

        sitemapData.forEach((entry) => {
            expect(entry.url).toMatch(/^https:\/\/openl\.app/);
        });
    });

    it('should have valid priority values between 0 and 1', async () => {
        const sitemapData = await sitemap();

        sitemapData.forEach((entry) => {
            expect(entry.priority).toBeGreaterThanOrEqual(0);
            expect(entry.priority).toBeLessThanOrEqual(1);
        });
    });

    it('should have valid changeFrequency values', async () => {
        const sitemapData = await sitemap();
        const validFrequencies = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];

        sitemapData.forEach((entry) => {
            expect(validFrequencies).toContain(entry.changeFrequency);
        });
    });
});
