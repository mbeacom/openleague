import { describe, it, expect, beforeAll } from 'vitest';
import { MetadataRoute } from 'next';
import robots from '@/app/robots';

describe('Robots.txt Generation', () => {
    let robotsData: MetadataRoute.Robots;
    let generalRule: Record<string, any> | undefined;

    beforeAll(() => {
        robotsData = robots() as MetadataRoute.Robots;
        generalRule = (robotsData.rules as Array<Record<string, any>>).find((rule) => rule.userAgent === '*');
    });

    it('should generate valid robots configuration', () => {
        expect(robotsData).toBeDefined();
        expect(robotsData.rules).toBeDefined();
        expect(Array.isArray(robotsData.rules)).toBe(true);
    });

    it('should include sitemap URL', () => {
        expect(robotsData.sitemap).toBe('https://openl.app/sitemap.xml');
    });

    describe('General crawler rules (*)', () => {
        it('should be defined and allow access', () => {
            expect(generalRule).toBeDefined();
            expect(generalRule?.allow).toBe('/');
        });

        it('should block API routes', () => {
            const disallowedPaths = generalRule?.disallow as string[];
            expect(disallowedPaths).toContain('/api/');
        });

        it('should block dashboard routes', () => {
            const disallowedPaths = generalRule?.disallow as string[];
            expect(disallowedPaths).toContain('/dashboard/');
        });

        it('should block admin routes', () => {
            const disallowedPaths = generalRule?.disallow as string[];
            expect(disallowedPaths).toContain('/admin/');
        });

        it('should block authentication pages', () => {
            const disallowedPaths = generalRule?.disallow as string[];
            expect(disallowedPaths).toContain('/login');
            expect(disallowedPaths).toContain('/signup');
        });

        it('should block Next.js internal routes', () => {
            const disallowedPaths = generalRule?.disallow as string[];
            expect(disallowedPaths).toContain('/_next/');
        });
    });

    describe('AI crawler rules', () => {
        it('should block AI crawlers with array of user agents', () => {
            const aiRule = (robotsData.rules as Array<Record<string, any>>).find(
                (r) => Array.isArray(r.userAgent) && r.userAgent.includes('GPTBot')
            );

            expect(aiRule).toBeDefined();
            expect(Array.isArray(aiRule?.userAgent)).toBe(true);
            expect((aiRule?.userAgent as string[])).toContain('GPTBot');
            expect((aiRule?.userAgent as string[])).toContain('ChatGPT-User');
            expect((aiRule?.userAgent as string[])).toContain('CCBot');
            expect((aiRule?.userAgent as string[])).toContain('anthropic-ai');
            expect((aiRule?.userAgent as string[])).toContain('Claude-Web');
            expect(aiRule?.disallow).toEqual(['/']);
        });
    });

    it('should have exactly two rules', () => {
        expect((robotsData.rules as Array<Record<string, any>>).length).toBe(2);
    });

    it('should use correct base URL for sitemap', () => {
        expect(robotsData.sitemap).toMatch(/^https:\/\/openl\.app/);
    });
});
