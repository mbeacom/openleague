import { describe, expect, it } from 'vitest';
import { buildAppDocsPages, buildPrivacyPage, wrapPage, type StaticPage } from '@/scripts/build-docs-pages';

const page = (href: string): StaticPage => ({ title: 'Page', description: 'Page', href, html: '' });
const footerPrivacyHref = (html: string) => html.match(/<footer>[\s\S]*?<a href="([^"]*)">Planner privacy policy<\/a>/)?.[1];

describe('docs pages privacy policy', () => {
  it('links the privacy policy from the footer at every page depth', () => {
    expect(footerPrivacyHref(wrapPage(page('/docs'), []))).toBe('privacy/');
    expect(footerPrivacyHref(wrapPage(page('/docs/guides'), []))).toBe('../privacy/');
    expect(footerPrivacyHref(wrapPage(page('/docs/reference/security'), []))).toBe('../../privacy/');
  });

  it('describes the planner and its Drive access on the home page, with a policy link', async () => {
    const home = (await buildAppDocsPages()).find((p) => p.href === '/docs');
    expect(home?.html).toMatch(/About the OpenLeague Planner/);
    expect(home?.html).toMatch(/Google Drive/);
    expect(home?.html).toMatch(/<a href="privacy\/">privacy policy<\/a>/);
  });

  it('publishes the policy at /privacy/ with the Google user data disclosures', async () => {
    const privacy = await buildPrivacyPage();
    expect(privacy.href).toBe('/docs/privacy');
    expect(privacy.title).toBe('OpenLeague Planner Privacy Policy');
    // The header carries the title, so the body has no second H1.
    expect(privacy.html).not.toMatch(/<h1>/);
    expect(privacy.html).toMatch(/drive\.file/);
    expect(privacy.html).toMatch(/Limited Use/);
    expect(privacy.html).toMatch(/api-services-user-data-policy/);
  });
});
