import { describe, it, expect } from 'vitest';
import sitemap from '@/app/sitemap';

describe('Sitemap Generation', () => {
    it('should generate a valid sitemap array', () => {
        const sitemapData = sitemap();

        expect(Array.isArray(sitemapData)).toBe(true);
        expect(sitemapData.length).toBeGreaterThan(0);
    });

    it('should include homepage with highest priority', () => {
        const sitemapData = sitemap();
        const homepage = sitemapData.find((entry) => entry.url === 'https://openl.app');

        expect(homepage).toBeDefined();
        expect(homepage?.priority).toBe(1.0);
        expect(homepage?.changeFrequency).toBe('weekly');
    });

    it('should include all marketing pages', () => {
        const sitemapData = sitemap();
        const urls = sitemapData.map((entry) => entry.url);

        expect(urls).toContain('https://openl.app/features');
        expect(urls).toContain('https://openl.app/pricing');
        expect(urls).toContain('https://openl.app/get-started');
        expect(urls).toContain('https://openl.app/contact');
        expect(urls).toContain('https://openl.app/about');
    });

    it('should include documentation pages', () => {
        const sitemapData = sitemap();
        const urls = sitemapData.map((entry) => entry.url);

        expect(urls).toContain('https://openl.app/docs');
        expect(urls).toContain('https://openl.app/docs/user-guide');
        expect(urls).toContain('https://openl.app/docs/guides');
        expect(urls).toContain('https://openl.app/docs/api');
        expect(urls).toContain('https://openl.app/docs/contributing');
    });

    it('should include legal pages with lower priority', () => {
        const sitemapData = sitemap();
        const privacyPage = sitemapData.find((entry) => entry.url === 'https://openl.app/privacy');
        const termsPage = sitemapData.find((entry) => entry.url === 'https://openl.app/terms');

        expect(privacyPage).toBeDefined();
        expect(termsPage).toBeDefined();
        expect(privacyPage?.priority).toBe(0.3);
        expect(termsPage?.priority).toBe(0.3);
    });

    it('should set appropriate priorities for different page types', () => {
        const sitemapData = sitemap();
        const homepage = sitemapData.find((entry) => entry.url === 'https://openl.app');
        const featuresPage = sitemapData.find((entry) => entry.url === 'https://openl.app/features');
        const legalPage = sitemapData.find((entry) => entry.url === 'https://openl.app/privacy');

        expect(homepage?.priority).toBeGreaterThan(featuresPage?.priority || 0);
        expect(featuresPage?.priority).toBeGreaterThan(legalPage?.priority || 0);
    });

    it('should set appropriate change frequencies', () => {
        const sitemapData = sitemap();
        const homepage = sitemapData.find((entry) => entry.url === 'https://openl.app');
        const legalPage = sitemapData.find((entry) => entry.url === 'https://openl.app/privacy');

        expect(homepage?.changeFrequency).toBe('weekly');
        expect(legalPage?.changeFrequency).toBe('yearly');
    });

    it('should include lastModified dates for all entries', () => {
        const sitemapData = sitemap();

        sitemapData.forEach((entry) => {
            expect(entry.lastModified).toBeInstanceOf(Date);
        });
    });

    it('should use correct base URL', () => {
        const sitemapData = sitemap();

        sitemapData.forEach((entry) => {
            expect(entry.url).toMatch(/^https:\/\/openl\.app/);
        });
    });

    it('should have valid priority values between 0 and 1', () => {
        const sitemapData = sitemap();

        sitemapData.forEach((entry) => {
            expect(entry.priority).toBeGreaterThanOrEqual(0);
            expect(entry.priority).toBeLessThanOrEqual(1);
        });
    });

    it('should have valid changeFrequency values', () => {
        const sitemapData = sitemap();
        const validFrequencies = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];

        sitemapData.forEach((entry) => {
            expect(validFrequencies).toContain(entry.changeFrequency);
        });
    });
});
