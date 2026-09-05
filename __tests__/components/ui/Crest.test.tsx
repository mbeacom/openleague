import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import theme from '@/lib/theme';
import { Crest } from '@/components/ui/Crest';
import { crestColorForId } from '@/lib/utils/crest';

function renderCrest(props: React.ComponentProps<typeof Crest>) {
  return render(
    <ThemeProvider theme={theme}>
      <Crest {...props} />
    </ThemeProvider>,
  );
}

describe('Crest', () => {
  it('renders a monogram when there is no logo', () => {
    renderCrest({ name: 'Ice Breakers', id: 'team-1' });
    expect(screen.getByText('IB')).toBeInTheDocument();
  });

  it('renders the logo instead of the monogram when one is set', () => {
    const { container } = renderCrest({
      name: 'Ice Breakers',
      id: 'team-1',
      logoUrl: 'https://example.com/crest.png',
    });

    const image = container.querySelector('img');
    expect(image).toHaveAttribute('src', 'https://example.com/crest.png');
    expect(screen.queryByText('IB')).not.toBeInTheDocument();
  });

  it('contains the logo rather than cropping it', () => {
    // Club artwork is usually square or a wordmark; filling a circle would
    // behead both, so containment is a promise this component makes.
    const { container } = renderCrest({
      name: 'Ice Breakers',
      id: 'team-1',
      logoUrl: 'https://example.com/crest.png',
    });
    expect(container.querySelector('img')).toHaveStyle({ objectFit: 'contain' });
  });

  it('gives the logo an empty alt so it is not announced twice', () => {
    // The surrounding row always names the entity in text.
    const { container } = renderCrest({
      name: 'Ice Breakers',
      id: 'team-1',
      logoUrl: 'https://example.com/crest.png',
    });
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
  });

  it('paints the derived color when no brand color is set', () => {
    const { container } = renderCrest({ name: 'Storm', id: 'team-7' });
    expect(container.firstChild).toHaveStyle({
      backgroundColor: crestColorForId('team-7'),
    });
  });

  it('prefers an owner-chosen brand color', () => {
    const { container } = renderCrest({
      name: 'Storm',
      id: 'team-7',
      brandColor: '#8B0000',
    });
    expect(container.firstChild).toHaveStyle({ backgroundColor: '#8B0000' });
  });

  it('uses dark ink on a pale brand color', () => {
    // White on pale is the one unreadable result this component could produce.
    const { container } = renderCrest({
      name: 'Storm',
      id: 'team-7',
      brandColor: '#FFEB3B',
    });
    expect(container.firstChild).toHaveStyle({ color: theme.palette.common.black });
  });

  it('uses light ink on a deep brand color', () => {
    const { container } = renderCrest({
      name: 'Storm',
      id: 'team-7',
      brandColor: '#0D47A1',
    });
    expect(container.firstChild).toHaveStyle({ color: theme.palette.common.white });
  });

  it('scales with the size step', () => {
    const { container: small } = renderCrest({ name: 'Storm', id: 't', size: 'xs' });
    const { container: large } = renderCrest({ name: 'Storm', id: 't', size: 'xl' });
    expect(small.firstChild).toHaveStyle({ width: '28px' });
    expect(large.firstChild).toHaveStyle({ width: '104px' });
  });

  it('is hidden from assistive tech, since the entity is always named in text', () => {
    const { container } = renderCrest({ name: 'Storm', id: 'team-7' });
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});
