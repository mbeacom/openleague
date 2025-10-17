import { describe, it, expect } from 'vitest';
import {
    SITE_CONFIG,
    generatePageMetadata,
    getOrganizationSchema,
    getSoftwareApplicationSchema,
    getBreadcrumbSchema,
    getFAQSchema,
} from '@/lib/config/seo';

describe('SEO Configuration', () => {
    describe('SITE_CONFIG', () => {
        it('should have all required site configuration properties', () => {
            expect(SITE_CONFIG.name).toBe('OpenLeague');
            expect(SITE_CONFIG.title).toBeTruthy();
            expect(SITE_CONFIG.description).toBeTruthy();
            expect(SITE_CONFIG.url).toBe('https://openl.app');
            expect(SITE_CONFIG.ogImage).toBeTruthy();
            expect(SITE_CONFIG.twitterHandle).toBeTruthy();
            expect(Array.isArray(SITE_CONFIG.keywords)).toBe(true);
            expect(SITE_CONFIG.keywords.length).toBeGreaterThan(0);
        });

        it('should include relevant keywords for sports team management', () => {
            const keywords = SITE_CONFIG.keywords;
            expect(keywords).toContain('sports team management');
            expect(keywords).toContain('team organization');
            expect(keywords).toContain('roster management');
        });
    });

    describe('generatePageMetadata', () => {
        it('should generate basic metadata with title and description', () => {
            const metadata = generatePageMetadata({
                title: 'Test Page',
                description: 'Test description',
            });

            expect(metadata.title).toBe('Test Page - OpenLeague');
            expect(metadata.description).toBe('Test description');
        });

        it('should not duplicate OpenLeague in title if already present', () => {
            const metadata = generatePageMetadata({
                title: 'OpenLeague - Test',
                description: 'Test description',
            });

            expect(metadata.title).toBe('OpenLeague - Test');
        });

        it('should generate Open Graph metadata', () => {
            const metadata = generatePageMetadata({
                title: 'Features',
                description: 'Feature description',
                path: '/features',
            });

            expect(metadata.openGraph).toBeDefined();
            expect((metadata.openGraph as any)?.title).toBe('Features - OpenLeague');
            expect((metadata.openGraph as any)?.description).toBe('Feature description');
            expect((metadata.openGraph as any)?.url).toBe('https://openl.app/features');
            expect((metadata.openGraph as any)?.siteName).toBe('OpenLeague');
        });

        it('should generate Twitter Card metadata', () => {
            const metadata = generatePageMetadata({
                title: 'Pricing',
                description: 'Pricing description',
            });

            expect(metadata.twitter).toBeDefined();
            expect((metadata.twitter as any)?.title).toBe('Pricing - OpenLeague');
            expect((metadata.twitter as any)?.description).toBe('Pricing description');
            expect((metadata.twitter as any)?.site).toBe('@openleague');
        });

        it('should merge custom keywords with site keywords', () => {
            const metadata = generatePageMetadata({
                title: 'Test',
                description: 'Test',
                keywords: ['custom', 'keywords'],
            });

            const keywordsString = metadata.keywords as string;
            expect(keywordsString).toContain('custom');
            expect(keywordsString).toContain('keywords');
            expect(keywordsString).toContain('sports team management');
        });

        it('should set canonical URL correctly', () => {
            const metadata = generatePageMetadata({
                title: 'About',
                description: 'About page',
                path: '/about',
            });

            expect(metadata.alternates?.canonical).toBe('https://openl.app/about');
        });

        it('should handle noIndex flag for robots', () => {
            const indexedMetadata = generatePageMetadata({
                title: 'Public Page',
                description: 'Public',
                noIndex: false,
            });

            const noIndexMetadata = generatePageMetadata({
                title: 'Private Page',
                description: 'Private',
                noIndex: true,
            });

            expect(indexedMetadata.robots).toHaveProperty('index', true);
            expect(indexedMetadata.robots).toHaveProperty('follow', true);
            expect(noIndexMetadata.robots).toHaveProperty('index', false);
            expect(noIndexMetadata.robots).toHaveProperty('follow', false);
        });

        it('should use custom OG image when provided', () => {
            const metadata = generatePageMetadata({
                title: 'Custom',
                description: 'Custom',
                ogImage: '/custom-image.png',
            });

            const ogImages = metadata.openGraph?.images;
            const twitterImages = (metadata.twitter as any)?.images;

            if (Array.isArray(ogImages)) {
                expect((ogImages[0] as any)?.url).toBe('/custom-image.png');
            }
            if (Array.isArray(twitterImages)) {
                expect(twitterImages[0]).toBe('/custom-image.png');
            }
        });
    });

    describe('Structured Data Schemas', () => {
        describe('getOrganizationSchema', () => {
            it('should generate valid Organization schema', () => {
                const schema = getOrganizationSchema();

                expect(schema['@context']).toBe('https://schema.org');
                expect(schema['@type']).toBe('Organization');
                expect(schema.name).toBe('OpenLeague');
                expect(schema.url).toBe('https://openl.app');
                expect(schema.logo).toBeTruthy();
                expect(schema.description).toBeTruthy();
            });

            it('should include contact point information', () => {
                const schema = getOrganizationSchema();

                expect(schema.contactPoint).toBeDefined();
                expect(schema.contactPoint['@type']).toBe('ContactPoint');
                expect(schema.contactPoint.email).toBeTruthy();
                expect(schema.contactPoint.contactType).toBe('Customer Support');
            });

            it('should include social media profiles', () => {
                const schema = getOrganizationSchema();

                expect(Array.isArray(schema.sameAs)).toBe(true);
                expect(schema.sameAs.length).toBeGreaterThan(0);
            });
        });

        describe('getSoftwareApplicationSchema', () => {
            it('should generate valid SoftwareApplication schema', () => {
                const schema = getSoftwareApplicationSchema();

                expect(schema['@context']).toBe('https://schema.org');
                expect(schema['@type']).toBe('SoftwareApplication');
                expect(schema.name).toBe('OpenLeague');
                expect(schema.applicationCategory).toBe('BusinessApplication');
                expect(schema.operatingSystem).toBe('Web Browser');
            });

            it('should include free pricing offer', () => {
                const schema = getSoftwareApplicationSchema();

                expect(schema.offers).toBeDefined();
                expect(schema.offers['@type']).toBe('Offer');
                expect(schema.offers.price).toBe('0');
                expect(schema.offers.priceCurrency).toBe('USD');
            });

            it('should include feature list', () => {
                const schema = getSoftwareApplicationSchema();

                expect(Array.isArray(schema.featureList)).toBe(true);
                expect(schema.featureList).toContain('Roster Management');
                expect(schema.featureList).toContain('Event Scheduling');
                expect(schema.featureList).toContain('RSVP Tracking');
            });

            it('should include aggregate rating', () => {
                const schema = getSoftwareApplicationSchema();

                expect(schema.aggregateRating).toBeDefined();
                expect(schema.aggregateRating['@type']).toBe('AggregateRating');
                expect(schema.aggregateRating.ratingValue).toBeTruthy();
            });
        });

        describe('getBreadcrumbSchema', () => {
            it('should generate valid BreadcrumbList schema', () => {
                const items = [
                    { name: 'Home', url: '/' },
                    { name: 'Features', url: '/features' },
                ];
                const schema = getBreadcrumbSchema(items);

                expect(schema['@context']).toBe('https://schema.org');
                expect(schema['@type']).toBe('BreadcrumbList');
                expect(Array.isArray(schema.itemListElement)).toBe(true);
                expect(schema.itemListElement.length).toBe(2);
            });

            it('should correctly position breadcrumb items', () => {
                const items = [
                    { name: 'Home', url: '/' },
                    { name: 'Docs', url: '/docs' },
                    { name: 'Guide', url: '/docs/guide' },
                ];
                const schema = getBreadcrumbSchema(items);

                expect(schema.itemListElement[0].position).toBe(1);
                expect(schema.itemListElement[1].position).toBe(2);
                expect(schema.itemListElement[2].position).toBe(3);
            });

            it('should include full URLs for breadcrumb items', () => {
                const items = [{ name: 'Features', url: '/features' }];
                const schema = getBreadcrumbSchema(items);

                expect(schema.itemListElement[0].item).toBe('https://openl.app/features');
            });
        });

        describe('getFAQSchema', () => {
            it('should generate valid FAQPage schema', () => {
                const faqs = [
                    { question: 'What is OpenLeague?', answer: 'A team management platform' },
                    { question: 'Is it free?', answer: 'Yes, completely free' },
                ];
                const schema = getFAQSchema(faqs);

                expect(schema['@context']).toBe('https://schema.org');
                expect(schema['@type']).toBe('FAQPage');
                expect(Array.isArray(schema.mainEntity)).toBe(true);
                expect(schema.mainEntity.length).toBe(2);
            });

            it('should structure FAQ items correctly', () => {
                const faqs = [{ question: 'Test question?', answer: 'Test answer' }];
                const schema = getFAQSchema(faqs);

                const faqItem = schema.mainEntity[0];
                expect(faqItem['@type']).toBe('Question');
                expect(faqItem.name).toBe('Test question?');
                expect(faqItem.acceptedAnswer['@type']).toBe('Answer');
                expect(faqItem.acceptedAnswer.text).toBe('Test answer');
            });
        });
    });
});
