import { describe, expect, it } from 'vitest';
import { buildAppDocsPages, wrapPage, type StaticPage } from '@/scripts/build-docs-pages';

const page = (href: string): StaticPage => ({ title: 'Page', description: 'Page', href, html: '' });
const navPlannerHref = (html: string) => html.match(/<a href="([^"]*)">Practice planner<\/a>/)?.[1];

describe('docs pages planner link', () => {
  it('links the planner from the nav at every page depth', () => {
    expect(navPlannerHref(wrapPage(page('/docs'), []))).toBe('planner/');
    expect(navPlannerHref(wrapPage(page('/docs/guides'), []))).toBe('../planner/');
    expect(navPlannerHref(wrapPage(page('/docs/reference/security'), []))).toBe('../../planner/');
  });

  it('shows a planner card on the docs home page', async () => {
    const pages = await buildAppDocsPages();
    const home = pages.find((p) => p.href === '/docs');
    expect(home?.html).toMatch(/<h2><a href="planner\/">Practice planner<\/a><\/h2>/);
  });
});
