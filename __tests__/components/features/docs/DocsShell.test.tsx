import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material/styles';
import type { ReactElement, ReactNode } from 'react';
import theme from '@/lib/theme';
import DocsShell from '@/components/features/docs/DocsShell';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const renderWithTheme = (component: ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('DocsShell', () => {
  it('renders sidebar navigation and breadcrumbs for the active docs page', () => {
    renderWithTheme(
      <DocsShell pathname="/docs/user-guide">
        <h1>Guide content</h1>
      </DocsShell>,
    );

    expect(screen.getByRole('navigation', { name: /documentation navigation/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /getting started/i })).toHaveAttribute('href', '/docs/guides');
    expect(screen.getByRole('link', { name: /api reference/i })).toHaveAttribute('href', '/docs/api');

    const breadcrumbs = screen.getByLabelText(/documentation breadcrumbs/i);
    expect(within(breadcrumbs).getByRole('link', { name: /documentation/i })).toHaveAttribute('href', '/docs');
    expect(within(breadcrumbs).getByText('Start here')).toBeInTheDocument();
    expect(within(breadcrumbs).getByText('User Guide')).toBeInTheDocument();
  });

  it('filters documentation links with local search', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <DocsShell pathname="/docs">
        <h1>Docs home</h1>
      </DocsShell>,
    );

    await user.type(screen.getByRole('textbox', { name: /search documentation/i }), 'rsvp');

    const results = screen.getByRole('list', { name: /documentation search results/i });
    expect(within(results).getByRole('link', { name: /user guide/i })).toHaveAttribute('href', '/docs/user-guide');
    expect(within(results).queryByRole('link', { name: /api reference/i })).not.toBeInTheDocument();
  });
});
