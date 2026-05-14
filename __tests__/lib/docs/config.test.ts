import { describe, expect, it } from 'vitest';
import {
  docsItems,
  getDocByHref,
  getDocsBreadcrumbs,
  normalizeDocsPath,
  searchDocs,
} from '@/lib/docs/config';

describe('docs config', () => {
  it('defines initial documentation pages', () => {
    expect(docsItems.map((item) => item.href)).toEqual(
      expect.arrayContaining([
        '/docs/guides',
        '/docs/user-guide',
        '/docs/api',
        '/docs/contributing',
      ]),
    );
  });

  it('normalizes docs paths and finds entries', () => {
    expect(normalizeDocsPath('/docs/user-guide/')).toBe('/docs/user-guide');
    expect(getDocByHref('/docs/api/')?.title).toBe('API Reference');
  });

  it('builds breadcrumbs for nested documentation pages', () => {
    expect(getDocsBreadcrumbs('/docs/user-guide')).toEqual([
      { label: 'Documentation', href: '/docs' },
      { label: 'Start here' },
      { label: 'User Guide' },
    ]);
  });

  it('searches title, description, and keywords', () => {
    expect(searchDocs('rsvp').map((item) => item.title)).toContain('User Guide');
    expect(searchDocs('server actions').map((item) => item.title)).toContain('API Reference');
    expect(searchDocs('nothing-matches-this')).toEqual([]);
  });
});
