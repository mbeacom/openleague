export interface DocsNavItem {
  title: string;
  href: string;
  description: string;
  keywords: string[];
}

export interface DocsNavSection {
  title: string;
  items: DocsNavItem[];
}

export interface DocsBreadcrumb {
  label: string;
  href?: string;
}

export const docsSections: DocsNavSection[] = [
  {
    title: 'Start here',
    items: [
      {
        title: 'Getting Started',
        href: '/docs/guides',
        description: 'Launch a team workspace, invite your roster, and publish your first event.',
        keywords: ['setup', 'onboarding', 'signup', 'team', 'quick start'],
      },
      {
        title: 'User Guide',
        href: '/docs/user-guide',
        description: 'Learn the day-to-day workflows for rosters, schedules, RSVPs, and communication.',
        keywords: ['manager', 'player', 'roster', 'events', 'rsvp', 'messages'],
      },
    ],
  },
  {
    title: 'Reference',
    items: [
      {
        title: 'API Reference',
        href: '/docs/api',
        description: 'Understand the current API route surface and Server Action integration model.',
        keywords: ['api', 'integration', 'server actions', 'csv', 'auth'],
      },
      {
        title: 'Product Roadmap',
        href: '/docs/roadmap',
        description: 'See upcoming OpenLeague features and community priorities.',
        keywords: ['roadmap', 'planned', 'features', 'future'],
      },
    ],
  },
  {
    title: 'Project',
    items: [
      {
        title: 'Contributing',
        href: '/docs/contributing',
        description: 'Set up a local development environment and contribute safely.',
        keywords: ['contribute', 'development', 'tests', 'bun', 'pull request'],
      },
    ],
  },
];

export const docsHome: DocsNavItem = {
  title: 'Documentation',
  href: '/docs',
  description: 'OpenLeague documentation home.',
  keywords: ['docs', 'documentation', 'help'],
};

export const docsItems = docsSections.flatMap((section) => section.items);

export function normalizeDocsPath(pathname: string): string {
  const withoutTrailingSlash = pathname.replace(/\/+$/, '');
  return withoutTrailingSlash || '/docs';
}

export function getDocByHref(pathname: string): DocsNavItem | undefined {
  const normalizedPath = normalizeDocsPath(pathname);

  if (normalizedPath === docsHome.href) {
    return docsHome;
  }

  return docsItems.find((item) => item.href === normalizedPath);
}

export function getDocsBreadcrumbs(pathname: string): DocsBreadcrumb[] {
  const normalizedPath = normalizeDocsPath(pathname);
  const currentDoc = getDocByHref(normalizedPath);

  if (!currentDoc || currentDoc.href === docsHome.href) {
    return [{ label: docsHome.title }];
  }

  const section = docsSections.find((candidate) =>
    candidate.items.some((item) => item.href === currentDoc.href),
  );

  return [
    { label: docsHome.title, href: docsHome.href },
    ...(section ? [{ label: section.title }] : []),
    { label: currentDoc.title },
  ];
}

export function searchDocs(query: string): DocsNavItem[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  const queryTerms = normalizedQuery.split(/\s+/).filter(Boolean);

  return docsItems
    .map((item) => {
      const searchableText = [
        item.title,
        item.description,
        ...item.keywords,
      ].join(' ').toLowerCase();

      const score = queryTerms.reduce((total, term) => {
        if (item.title.toLowerCase().includes(term)) {
          return total + 3;
        }

        if (searchableText.includes(term)) {
          return total + 1;
        }

        return total;
      }, 0);

      return { item, score };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
    .map((result) => result.item);
}
