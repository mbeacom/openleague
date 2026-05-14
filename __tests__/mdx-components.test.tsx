import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import type { ComponentType, ReactElement, ReactNode } from 'react';
import theme from '@/lib/theme';
import { useMDXComponents } from '@/mdx-components';

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

describe('MDX components', () => {
  it('renders styled code blocks with a language marker', () => {
    const components = useMDXComponents();
    const Pre = components.pre as ComponentType<{ children: ReactNode }>;
    const Code = components.code as ComponentType<{ className?: string; children: ReactNode }>;

    renderWithTheme(
      <Pre>
        <Code className="language-ts">const team = true;</Code>
      </Pre>,
    );

    expect(screen.getByTestId('mdx-code-block')).toBeInTheDocument();
    expect(screen.getByText('const team = true;')).toHaveAttribute('data-language', 'ts');
  });

  it('renders internal documentation links as links', () => {
    const components = useMDXComponents();
    const Anchor = components.a as ComponentType<{ href: string; children: ReactNode }>;

    renderWithTheme(<Anchor href="/docs/guides">Getting Started</Anchor>);

    expect(screen.getByRole('link', { name: /getting started/i })).toHaveAttribute('href', '/docs/guides');
  });

  it('opens external documentation links in a hardened new tab', () => {
    const components = useMDXComponents();
    const Anchor = components.a as ComponentType<{ href: string; children: ReactNode }>;

    renderWithTheme(<Anchor href="https://example.com/docs">External docs</Anchor>);

    const link = screen.getByRole('link', { name: /external docs/i });
    expect(link).toHaveAttribute('href', 'https://example.com/docs');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
