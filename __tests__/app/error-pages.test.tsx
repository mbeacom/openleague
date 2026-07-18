import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import RootNotFound from '@/app/not-found';
import RootError from '@/app/error';
import GlobalError from '@/app/global-error';

const captureException = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

beforeEach(() => {
  captureException.mockClear();
});

describe('RootNotFound', () => {
  it('renders the 404 message with home and dashboard links', () => {
    render(<RootNotFound />);

    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to home/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /open dashboard/i })).toHaveAttribute(
      'href',
      '/dashboard'
    );
  });
});

describe('RootError', () => {
  it('reports the error to Sentry and retries via reset', () => {
    const reset = vi.fn();
    const error = Object.assign(new Error('boom'), { digest: 'abc' });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<RootError error={error} reset={reset} />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(captureException).toHaveBeenCalledWith(error);

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });
});

describe('GlobalError', () => {
  // global-error renders its own <html>/<body>, so assert on static markup
  // instead of mounting it inside a jsdom container.
  it('renders a self-contained fallback without MUI/Emotion', () => {
    const markup = renderToStaticMarkup(
      <GlobalError error={new Error('boom')} reset={() => {}} />
    );

    expect(markup).toContain('<html lang="en">');
    expect(markup).toContain('Something went wrong');
    expect(markup).toContain('Try again');
    expect(markup).not.toContain('Mui');
  });
});
