import { describe, it, expect } from 'vitest';
import { MetadataRoute } from 'next';
import robots from '@/app/robots';

describe('Robots.txt Generation', () => {
    it('should generate valid robots configuration', () => {
        const robotsData = robots() as MetadataRoute.Robots;

        expect(robotsData).toBeDefined();
        expect(robotsData.rules).toBeDefined();
        expect(Array.isArray(robotsData.rules)).toBe(true);
    });

    it('should include sitemap URL', () => {
        const robotsData = robots() as MetadataRoute.Robots;

        expect(robotsData.sitemap).toBe('https://openl.app/sitemap.xml');
    });

    it('should allow general crawlers to access public pages', () => {
        const robotsData = robots() as MetadataRoute.Robots;
        const generalRule = (robotsData.rules as Array<Record<string, any>>).find((rule) => rule.userAgent === '*');

        expect(generalRule).toBeDefined();
        expect(generalRule?.allow).toBe('/');
    });

    it('should disallow crawlers from accessing private routes', () => {
        const robotsData = robots() as MetadataRoute.Robots;
        const generalRule = (robotsData.rules as Array<Record<string, any>>).find((rule) => rule.userAgent === '*');

        expect(generalRule?.disallow).toBeDefined();
        expect(Array.isArray(generalRule?.disallow)).toBe(true);
    });

    it('should block API routes from crawling', () => {
        const robotsData = robots() as MetadataRoute.Robots;
        const generalRule = (robotsData.rules as Array<Record<string, any>>).find((rule) => rule.userAgent === '*');
        const disallowedPaths = generalRule?.disallow as string[];

        expect(disallowedPaths).toContain('/api/');
    });

    it('should block dashboard routes from crawling', () => {
        const robotsData = robots() as MetadataRoute.Robots;
        const generalRule = (robotsData.rules as Array<Record<string, any>>).find((rule) => rule.userAgent === '*');
        const disallowedPaths = generalRule?.disallow as string[];

        expect(disallowedPaths).toContain('/dashboard/');
    });

    it('should block admin routes from crawling', () => {
        const robotsData = robots() as MetadataRoute.Robots;
        const generalRule = (robotsData.rules as Array<Record<string, any>>).find((rule) => rule.userAgent === '*');
        const disallowedPaths = generalRule?.disallow as string[];

        expect(disallowedPaths).toContain('/admin/');
    });

    it('should block authentication pages from crawling', () => {
        const robotsData = robots() as MetadataRoute.Robots;
        const generalRule = (robotsData.rules as Array<Record<string, any>>).find((rule) => rule.userAgent === '*');
        const disallowedPaths = generalRule?.disallow as string[];

        expect(disallowedPaths).toContain('/login');
        expect(disallowedPaths).toContain('/signup');
    });

    it('should block Next.js internal routes from crawling', () => {
        const robotsData = robots() as MetadataRoute.Robots;
        const generalRule = (robotsData.rules as Array<Record<string, any>>).find((rule) => rule.userAgent === '*');
        const disallowedPaths = generalRule?.disallow as string[];

        expect(disallowedPaths).toContain('/_next/');
    });

    it('should block AI crawlers', () => {
        const robotsData = robots() as MetadataRoute.Robots;
        const aiCrawlers = ['GPTBot', 'ChatGPT-User', 'CCBot', 'anthropic-ai', 'Claude-Web'];

        aiCrawlers.forEach((crawler) => {
            const rule = (robotsData.rules as Array<Record<string, any>>).find((r) => r.userAgent === crawler);
            expect(rule).toBeDefined();
            expect(rule?.disallow).toEqual(['/']);
        });
    });

    it('should have multiple rules for different user agents', () => {
        const robotsData = robots() as MetadataRoute.Robots;

        expect((robotsData.rules as Array<Record<string, any>>).length).toBeGreaterThan(1);
    });

    it('should block GPTBot specifically', () => {
        const robotsData = robots() as MetadataRoute.Robots;
        const gptBotRule = (robotsData.rules as Array<Record<string, any>>).find((rule) => rule.userAgent === 'GPTBot');

        expect(gptBotRule).toBeDefined();
        expect(gptBotRule?.disallow).toEqual(['/']);
    });

    it('should block Anthropic AI crawlers', () => {
        const robotsData = robots() as MetadataRoute.Robots;
        const anthropicRule = (robotsData.rules as Array<Record<string, any>>).find((rule) => rule.userAgent === 'anthropic-ai');
        const claudeRule = (robotsData.rules as Array<Record<string, any>>).find((rule) => rule.userAgent === 'Claude-Web');

        expect(anthropicRule).toBeDefined();
        expect(anthropicRule?.disallow).toEqual(['/']);
        expect(claudeRule).toBeDefined();
        expect(claudeRule?.disallow).toEqual(['/']);
    });

    it('should use correct base URL for sitemap', () => {
        const robotsData = robots() as MetadataRoute.Robots;

        expect(robotsData.sitemap).toMatch(/^https:\/\/openl\.app/);
    });
});
