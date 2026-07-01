// Design-sync shim: replaces server-action modules (@/lib/actions/*) that
// scoped components import. Static previews never invoke these (they fire only
// on click/submit), but bundling the real modules drags in the entire Next.js
// server runtime (prisma, next/cache, @opentelemetry). These no-op stubs keep
// the preview bundle client-only. Add a named export here for each action a
// newly-scoped component imports.
export const deletePlayer = async () => ({ error: undefined as string | undefined });
export const updateRSVP = async () => ({ success: true as const });
