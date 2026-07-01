// Design-sync shim: next/navigation hooks -> inert stubs. Preview cards have no
// Next router; components that read these render as if on a static "/" route.
const noop = () => {};

export function usePathname(): string {
  return '/';
}

export function useRouter() {
  return {
    push: noop,
    replace: noop,
    back: noop,
    forward: noop,
    refresh: noop,
    prefetch: noop,
  };
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams();
}

export function useParams(): Record<string, string> {
  return {};
}

export function useSelectedLayoutSegment(): string | null {
  return null;
}

export function useSelectedLayoutSegments(): string[] {
  return [];
}

export function redirect(): never {
  throw new Error('redirect() called in a static preview');
}

export function notFound(): never {
  throw new Error('notFound() called in a static preview');
}
