import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Marked, type RendererObject } from 'marked';
import { docsHome, docsItems, docsSections, type DocsNavItem } from '../lib/docs/config';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'dist', 'docs-pages');
export const DEFAULT_DOCS_PAGES_DOMAIN = 'openleague.dev';
export const DOCS_PAGES_DOMAIN_ENV = 'DOCS_PAGES_DOMAIN';

const docsDomain = process.env[DOCS_PAGES_DOMAIN_ENV]?.trim() || DEFAULT_DOCS_PAGES_DOMAIN;

export interface StaticPage {
  title: string;
  description: string;
  href: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function staticDocsUrlForHref(href: string): string {
  const relative = href.replace(/^\/docs\/?/u, '').replace(/^\/+|\/+$/gu, '');
  return relative ? `/${relative}/` : '/';
}

function normalizeMarkdownHref(href: string): string {
  const trimmed = href.trim();

  if (!trimmed) {
    return '#';
  }

  if (trimmed.startsWith('/docs')) {
    return staticDocsUrlForHref(trimmed);
  }

  if (trimmed.startsWith('/') || trimmed.startsWith('#')) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol) ? parsed.toString() : '#';
  } catch {
    return '#';
  }
}

function stripMdxMetadata(content: string): string {
  return content.replace(/^export const metadata = \{[\s\S]*?\};\s*/u, '').trim();
}

const docsMarkdownRenderer: RendererObject<string, string> = {
  link({ href, title, tokens }) {
    const label = this.parser.parseInline(tokens);
    const safeHref = escapeHtml(normalizeMarkdownHref(href));
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : '';

    return `<a href="${safeHref}"${titleAttribute}>${label}</a>`;
  },
};

const docsMarkdown = new Marked({
  async: false,
  breaks: false,
  gfm: true,
  renderer: docsMarkdownRenderer,
});

export function renderMarkdown(markdown: string): string {
  return docsMarkdown.parse(stripMdxMetadata(markdown), { async: false });
}

function pagePathForHref(href: string): string {
  const relative = href.replace(/^\/docs\/?/, '');
  return relative ? path.join(relative, 'index.html') : 'index.html';
}

const plannerLink = {
  title: 'Practice planner',
  description: 'Draw drills and plan practices in your browser. Free, no account needed. Your plans stay on this device.',
};

/** Relative URL to the sibling `planner/` site, so it resolves on openleague.dev and on a fork's Pages subpath. */
export function plannerUrlFor(page: StaticPage): string {
  const depth = staticDocsUrlForHref(page.href).split('/').filter(Boolean).length;
  return `${'../'.repeat(depth)}planner/`;
}

const rankingsLink = {
  title: 'Team rankings',
  description: 'Paste your league\'s public schedule and snake chart to see placement ratings and who might move up or down. Computed in your browser; nothing is sent anywhere.',
};

/** The planner's privacy policy (served at /privacy/ beside the planner, which links to it). */
export const PLANNER_PRIVACY_SOURCE = path.join('apps', 'planner', 'PRIVACY.md');
export const plannerPrivacyHref = '/docs/privacy';

/** Relative URL to the privacy policy page, like `plannerUrlFor`. */
export function privacyUrlFor(page: StaticPage): string {
  const depth = staticDocsUrlForHref(page.href).split('/').filter(Boolean).length;
  return `${'../'.repeat(depth)}privacy/`;
}

/**
 * What the home page says the planner is and what it asks Google and Microsoft for: Google's
 * OAuth brand verification reads the home page for the app's purpose and a privacy policy link.
 */
export function plannerAboutHtml(page: StaticPage): string {
  return `<section class="about"><h2>About the OpenLeague Planner</h2>
<p>The <a href="${plannerUrlFor(page)}">OpenLeague Planner</a> is a free practice planner and team rankings tool for youth sports coaches. It runs entirely in your browser with no account: you draw drills, build practice plans and compare league placement ratings, and everything you make is stored on your own device.</p>
<p>If you choose, the Planner can save your plans to and open them from your own Google Drive or Microsoft OneDrive. For Google Drive it asks only for access to the files it creates and the files you pick; files go straight from your browser to your Drive and are never sent to OpenLeague. Read the <a href="${privacyUrlFor(page)}">privacy policy</a> for details.</p></section>`;
}

/** The planner's rankings route (a hash route), relative like `plannerUrlFor`. */
export function rankingsUrlFor(page: StaticPage): string {
  return `${plannerUrlFor(page)}#/rankings`;
}

export function wrapPage(page: StaticPage, navItems: DocsNavItem[]): string {
  const navLinks = navItems
    .map((item) => {
      return `<a href="${staticDocsUrlForHref(item.href)}">${escapeHtml(item.title)}</a>`;
    })
    .concat(`<a href="${plannerUrlFor(page)}">${escapeHtml(plannerLink.title)}</a>`)
    .concat(`<a href="${rankingsUrlFor(page)}">${escapeHtml(rankingsLink.title)}</a>`)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeHtml(page.description)}">
  <style>
    :root { color-scheme: light; --blue: #1d4ed8; --ink: #172033; --muted: #64748b; --ice: #f8fafc; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); background: var(--ice); line-height: 1.6; }
    header { background: linear-gradient(135deg, #0f2f57, #1d4ed8); color: white; padding: 3rem 1rem; }
    header div, main, footer { max-width: 960px; margin: 0 auto; }
    nav { display: flex; flex-wrap: wrap; gap: .75rem; margin-top: 1.5rem; }
    nav a { color: white; text-decoration: none; border: 1px solid rgba(255,255,255,.35); border-radius: 999px; padding: .4rem .8rem; }
    main { background: white; margin-top: -1.5rem; padding: 2rem; border-radius: 1rem; box-shadow: 0 16px 40px rgba(15, 23, 42, .08); }
    a { color: var(--blue); }
    code, pre { background: #eef2ff; border-radius: .4rem; }
    code { padding: .1rem .3rem; }
    pre { padding: 1rem; overflow-x: auto; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; }
    .card { border: 1px solid #e2e8f0; border-radius: .75rem; padding: 1rem; background: #fff; }
    .muted, footer { color: var(--muted); }
    footer { padding: 2rem 1rem; font-size: .9rem; }
    .about { margin-bottom: 2rem; }
  </style>
</head>
<body>
  <header><div><p class="muted" style="color:#bfdbfe;margin:0">OpenLeague</p><h1>${escapeHtml(page.title)}</h1><p>${escapeHtml(page.description)}</p><nav>${navLinks}</nav></div></header>
  <main>${page.html}</main>
  <footer>
    <p style="margin:0 0 .5rem">Generated from the OpenLeague repository docs. Main application: <a href="https://openl.app">openl.app</a>. <a href="${privacyUrlFor(page)}">Planner privacy policy</a>.</p>
    <p style="margin:0">&copy; 2025 Mark Beacom. This documentation is licensed under <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>; OpenLeague source code is licensed under <a href="https://github.com/mbeacom/openleague/blob/main/LICENSE">Apache 2.0</a>. &quot;OpenLeague&quot; and the OpenLeague logo are <a href="https://github.com/mbeacom/openleague/blob/main/TRADEMARKS.md">trademarks</a> of Mark Beacom.</p>
  </footer>
</body>
</html>
`;
}

export async function buildAppDocsPages(): Promise<StaticPage[]> {
  const pages: StaticPage[] = [];
  const cards = docsSections
    .map((section) => section.items
      .map((item) => `<article class="card"><p class="muted">${escapeHtml(section.title)}</p><h2><a href="${staticDocsUrlForHref(item.href)}">${escapeHtml(item.title)}</a></h2><p>${escapeHtml(item.description)}</p></article>`)
      .join('\n'))
    .join('\n');
  const home = { title: docsHome.title, description: docsHome.description, href: docsHome.href };
  const toolCard = (link: { title: string; description: string }, href: string) =>
    `<article class="card"><p class="muted">Tools</p><h2><a href="${href}">${escapeHtml(link.title)}</a></h2><p>${escapeHtml(link.description)}</p></article>`;
  const homePage = { ...home, html: '' };
  const toolCards = [toolCard(plannerLink, plannerUrlFor(homePage)), toolCard(rankingsLink, rankingsUrlFor(homePage))].join('\n');

  pages.push({ ...home, html: `${plannerAboutHtml(homePage)}<div class="cards">${cards}\n${toolCards}</div>` });

  for (const item of docsItems) {
    const slug = item.href.replace(/^\/docs\/?/, '');
    const mdxPath = path.join(rootDir, 'app', 'docs', slug, 'page.mdx');
    let html = `<h1>${escapeHtml(item.title)}</h1><p>${escapeHtml(item.description)}</p>`;

    if (existsSync(mdxPath)) {
      html = renderMarkdown(await readFile(mdxPath, 'utf8'));
    }

    pages.push({
      title: `${item.title} - OpenLeague Documentation`,
      description: item.description,
      href: item.href,
      html,
    });
  }

  return pages;
}

function titleFromMarkdown(markdown: string, fallback: string): string {
  const heading = /^#\s+(.+)$/m.exec(stripMdxMetadata(markdown));
  return heading?.[1]?.trim() || fallback;
}

async function buildRepositoryDocPages(): Promise<StaticPage[]> {
  const docsDir = path.join(rootDir, 'docs');
  if (!existsSync(docsDir)) return [];

  const entries = await readdir(docsDir, { withFileTypes: true });
  const pages: StaticPage[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const source = path.join(docsDir, entry.name);
    const markdown = await readFile(source, 'utf8');
    const slug = entry.name.replace(/\.md$/u, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const title = titleFromMarkdown(markdown, entry.name.replace(/\.md$/u, '').replace(/_/g, ' '));

    pages.push({
      title: `${title} - OpenLeague Documentation`,
      description: `Repository reference documentation for ${title}.`,
      href: `/docs/reference/${slug}`,
      html: renderMarkdown(markdown),
    });
  }

  return pages;
}

/** The planner's privacy policy, rendered without its own H1 (the page header carries the title). */
export async function buildPrivacyPage(): Promise<StaticPage> {
  const markdown = await readFile(path.join(rootDir, PLANNER_PRIVACY_SOURCE), 'utf8');
  return {
    title: titleFromMarkdown(markdown, 'Privacy Policy'),
    description: 'How the OpenLeague Planner handles your data, including Google Drive and OneDrive.',
    href: plannerPrivacyHref,
    html: renderMarkdown(markdown.replace(/^#\s+.+\n+/u, '')),
  };
}

async function writePage(page: StaticPage, navItems: DocsNavItem[]) {
  const relativePath = pagePathForHref(page.href);
  const destination = path.join(outputDir, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, wrapPage(page, navItems));
}

/** The static planner's Microsoft Entra app registration (a public client id, not a secret). */
const microsoftApplicationId = '91f29b89-9f2c-4210-93e2-c69502692bdd';

/**
 * Microsoft Entra publisher domain verification: ties the planner's app registration to this
 * domain. Served at /.well-known/microsoft-identity-association.json (`.nojekyll` lets Pages
 * serve the dot-directory).
 */
export async function writeMicrosoftIdentityAssociation(dir: string): Promise<string> {
  const file = path.join(dir, '.well-known', 'microsoft-identity-association.json');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify({ associatedApplications: [{ applicationId: microsoftApplicationId }] }, null, 2)}\n`);
  return file;
}

async function main() {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const appPages = await buildAppDocsPages();
  const repositoryPages = await buildRepositoryDocPages();
  const pages = [...appPages, await buildPrivacyPage(), ...repositoryPages];
  const navItems = [docsHome, ...docsItems];

  await Promise.all(pages.map((page) => writePage(page, navItems)));
  await writeFile(path.join(outputDir, '.nojekyll'), '');
  await writeFile(path.join(outputDir, 'CNAME'), `${docsDomain}\n`);
  await writeMicrosoftIdentityAssociation(outputDir);
  await writeFile(
    path.join(outputDir, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
      .map((page) => `  <url><loc>https://${docsDomain}${staticDocsUrlForHref(page.href)}</loc></url>`)
      .join('\n')}\n</urlset>\n`,
  );

  console.log(`Built ${pages.length} documentation pages in ${path.relative(rootDir, outputDir)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
