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
 * Sentry reshapes an envelope type.
 */
import { scrubTelemetryPayload } from './capability-privacy';

function scrubBeforeExport<T>(payload: T): T {
  return scrubTelemetryPayload(payload);
}

export const capabilityTokenPrivacyOptions = {
  beforeSend: scrubBeforeExport,
  beforeSendTransaction: scrubBeforeExport,
  beforeSendSpan: scrubBeforeExport,
  beforeBreadcrumb: scrubBeforeExport,
} as const;
