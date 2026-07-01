import * as React from 'react';

// Design-sync shim: next/link -> plain anchor. Preview cards render statically
// with no Next router, so Link degrades to <a>. Non-string hrefs (UrlObject)
// fall back to their pathname.
const NextLink = React.forwardRef<HTMLAnchorElement, any>(function NextLink(
  { href, children, prefetch: _p, replace: _r, scroll: _s, shallow: _sh, passHref: _ph, legacyBehavior: _lb, ...rest },
  ref,
) {
  const resolved = typeof href === 'string' ? href : href?.pathname ?? '#';
  return (
    <a ref={ref} href={resolved} {...rest}>
      {children}
    </a>
  );
});

export default NextLink;
