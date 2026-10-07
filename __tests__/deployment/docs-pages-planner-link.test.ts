import { describe, expect, it } from 'vitest';
import { buildAppDocsPages, wrapPage, type StaticPage } from '@/scripts/build-docs-pages';

const page = (href: string): StaticPage => ({ title: 'Page', description: 'Page', href, html: '' });
const navHref = (html: string, title: string) => html.match(new RegExp(`<nav>.*?<a href="([^"]*)">${title}</a>.*?</nav>`))?.[1];

describe('docs pages planner link', () => {
  it('links the planner from the nav at every page depth', () => {
    expect(navHref(wrapPage(page('/docs'), []), 'Practice planner')).toBe('planner/');
    expect(navHref(wrapPage(page('/docs/guides'), []), 'Practice planner')).toBe('../planner/');
    expect(navHref(wrapPage(page('/docs/reference/security'), []), 'Practice planner')).toBe('../../planner/');
  });

  it('links the rankings tool from the nav at every page depth', () => {
    expect(navHref(wrapPage(page('/docs'), []), 'Team rankings')).toBe('planner/#/rankings');
    expect(navHref(wrapPage(page('/docs/guides'), []), 'Team rankings')).toBe('../planner/#/rankings');
    expect(navHref(wrapPage(page('/docs/reference/security'), []), 'Team rankings')).toBe('../../planner/#/rankings');
  });

  it('shows planner and rankings cards on the generated docs home page', async () => {
    const pages = await buildAppDocsPages();
    const home = pages.find((p) => p.href === '/docs');
    const generated = wrapPage(home!, []);
    expect(generated).toMatch(/<h2><a href="planner\/">Practice planner<\/a><\/h2>/);
    expect(generated).toMatch(/<p class="muted">Tools<\/p><h2><a href="planner\/#\/rankings">Team rankings<\/a><\/h2>/);
    // One nav link and one card.
    expect(generated.match(/href="planner\/#\/rankings"/g)).toHaveLength(2);
  });
});
