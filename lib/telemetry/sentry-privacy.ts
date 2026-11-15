/**
 * Sentry hook bundle that redacts public capability tokens before export.
 *
 * Every runtime (browser, Node, edge) spreads this into `Sentry.init` so a
 * `/gear-wishlist/<token>` URL cannot leave the process through *any* envelope
 * type: error events, transactions, individual spans (including App Router
 * navigation spans started by `captureRouterTransitionStart`), and breadcrumbs.
 *
 * Breadcrumbs are scrubbed twice on purpose — once as they are recorded and
 * again as part of the enclosing event — so a token can never survive because a
 * single hook was skipped for a given envelope.
 *
 * The hooks are deliberately generic identity functions rather than typed
 * against Sentry's payload interfaces: they are structurally assignable to all
 * four option signatures, they never drop an event, and they cannot break when
 * Sentry reshapes an envelope type. That held across the v11 move to streamed
 * spans, whose `name`/`attributes` fields the recursive scrub covers unchanged.
 * `beforeSendTransaction` no longer runs in v11 (no transaction events are
 * produced); it stays registered so a static trace lifecycle is still covered.
 */
import type { init } from '@sentry/nextjs';
import { scrubTelemetryPayload } from './capability-privacy';

type SentryInitOptions = NonNullable<Parameters<typeof init>[0]>;
type DataCollection = NonNullable<SentryInitOptions['dataCollection']>;

function scrubBeforeExport<T>(payload: T): T {
  return scrubTelemetryPayload(payload);
}

export const capabilityTokenPrivacyOptions = {
  beforeSend: scrubBeforeExport,
  beforeSendTransaction: scrubBeforeExport,
  beforeSendSpan: scrubBeforeExport,
  beforeBreadcrumb: scrubBeforeExport,
} as const;

const SENSITIVE_KEYS = ['forwarded', '-ip', 'remote-', 'via', '-user'];

/**
 * What the SDK may collect, held to the restrictive defaults this app ran with
 * under v10's `sendDefaultPii: false`.
 *
 * Sentry v11 replaced `sendDefaultPii` with `dataCollection`, and an unset
 * `dataCollection` is permissive: user info and IP, cookies, full request and
 * response bodies, database query data and queue arguments are all collected.
 * These values are the v10 equivalents from Sentry's migration guide.
 */
export const restrictedDataCollection: DataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: { deny: SENSITIVE_KEYS },
    response: { deny: SENSITIVE_KEYS },
  },
  httpBodies: [],
  urlQueryParams: { deny: SENSITIVE_KEYS },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
};
