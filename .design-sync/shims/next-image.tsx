// Design-sync shim: next/image -> plain img. The Next Image optimizer/loader
// isn't available in a static preview, so we render the raw src. Imported
// static assets arrive as { src } objects; string public paths pass through.
//
// The OpenLeague Logo/BrandLogo components reference their artwork by hardcoded
// public paths (e.g. "/images/logo.webp") that aren't served in a static card
// or in a design built with this DS. We map those known paths to small,
// downscaled copies baked into the bundle as data URIs so the real brand marks
// render everywhere. (Sources: .design-sync/assets/, generated from public/images/.)
import logoIcon from '@/.design-sync/assets/logo-icon.png';
import brandFull from '@/.design-sync/assets/brand-logo-full.png';

const ASSET_MAP: Record<string, string> = {
  '/images/logo.webp': logoIcon,
  '/images/logo.png': logoIcon,
  '/images/alt-logo-transparent-background.png': brandFull,
  '/images/alt-logo-white-background.png': brandFull,
};

function NextImage({ src, alt, width, height, fill, style, priority: _p, loader: _l, quality: _q, placeholder: _pl, blurDataURL: _b, sizes: _sz, unoptimized: _u, ...rest }: any) {
  const mapped = typeof src === 'string' ? ASSET_MAP[src] : undefined;
  const resolved =
    mapped ?? (typeof src === 'string' ? src : src?.src ?? src?.default?.src ?? '');
  const resolvedStyle = fill
    ? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', ...style }
    : style;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolved}
      alt={alt ?? ''}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      style={resolvedStyle}
      {...rest}
    />
  );
}

export default NextImage;
