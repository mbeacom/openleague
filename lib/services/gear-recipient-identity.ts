import { createHmac } from "node:crypto";

/**
 * The identity segment of a gear outbox dedupe key.
 *
 * A dedupe key is `${eventType}:${aggregateId}:${occurrenceKey}:${identity}`,
 * and the identity segment answers two different questions at once:
 *
 *  1. *Which* recipient this occurrence was already queued for, so a repeated
 *     producer run collapses onto the existing row instead of sending twice.
 *  2. *How* the row was addressed — against an account, or against a bare
 *     address that never had one. The worker cannot ask `recipientUserId`,
 *     because `NotificationOutbox.recipientUser` is `onDelete: SetNull`: a
 *     deleted account leaves a row shaped exactly like an anonymous donor.
 *
 * Anonymous recipients are identified by a keyed digest rather than by their
 * address. A dedupe key is not covered by recipient redaction — it is a
 * uniqueness constraint, not contact data — so an address written here would
 * outlive every deletion path and surface in operator tooling, replay keys and
 * audit trails. The digest keeps both properties above (stable per address,
 * self-describing) while carrying nothing that can be sent an email.
 *
 * This is pseudonymous, not anonymous: the same address always produces the
 * same digest, which is precisely what makes deduplication work. It is not
 * reversible without the key, so an address cannot be recovered from a leaked
 * database, and it is not correlatable across deployments with different keys.
 */

/** Domain separation so this digest key is not the raw application secret. */
const IDENTITY_KEY_DOMAIN = "openleague:gear-outbox:recipient-identity:v1";

/**
 * 128 bits of a SHA-256 HMAC. Long enough that a collision between two donor
 * addresses in one league is not a practical concern, short enough to keep
 * dedupe keys readable in logs.
 */
const DIGEST_LENGTH = 32;

let cachedSecret: string | null = null;
let cachedKey: Buffer | null = null;

function identityKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    // Refusing to enqueue is the safe failure: an unkeyed digest of an address
    // is a rainbow-table lookup away from the address itself. The secret is
    // already required for the app to authenticate anyone, so in practice this
    // cannot be reached from a real mutation.
    throw new Error("NEXTAUTH_SECRET is required to derive gear notification recipient identities");
  }
  if (cachedKey && cachedSecret === secret) return cachedKey;
  cachedSecret = secret;
  cachedKey = createHmac("sha256", secret).update(IDENTITY_KEY_DOMAIN).digest();
  return cachedKey;
}

export function normalizeRecipientEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Opaque, non-reversible, stable identifier for an address with no account. */
export function anonymousRecipientDigest(email: string): string {
  return createHmac("sha256", identityKey())
    .update(normalizeRecipientEmail(email))
    .digest("hex")
    .slice(0, DIGEST_LENGTH);
}

/**
 * The identity segment for a recipient. Accounts are named by id — already an
 * opaque handle — and everyone else by digest.
 */
export function recipientIdentitySegment(recipient: {
  userId?: string | null;
  email: string;
}): string {
  return recipient.userId
    ? `user:${recipient.userId}`
    : `anon:${anonymousRecipientDigest(recipient.email)}`;
}

export type GearRecipientAddressing = "ACCOUNT" | "EXTERNAL";

/** A replayed row appends `:replay:<n>` to the key it was copied from. */
const REPLAY_SUFFIX = /(?::replay:\d+)+$/;

/**
 * Recovers how a row was addressed from its dedupe key.
 *
 * Both current forms are self-describing, so this needs neither the captured
 * address nor the (possibly nulled) user id. `capturedEmail` is used only to
 * classify rows written before the identity segment was tagged, where the
 * address itself was the segment.
 *
 * Anything unrecognized resolves to `ACCOUNT`, which suppresses delivery rather
 * than sending: misclassifying an account as external mails a departed member,
 * while misclassifying external as account merely drops a donor receipt.
 */
export function addressingFromDedupeKey(
  dedupeKey: string,
  capturedEmail: string | null | undefined,
): GearRecipientAddressing {
  const enqueued = dedupeKey.replace(REPLAY_SUFFIX, "");

  // `[^:]+` rather than a fixed digest width so a backfilled legacy row — whose
  // segment is opaque but not a digest — still classifies as external.
  if (/(?:^|:)anon:[^:]+$/.test(enqueued)) return "EXTERNAL";
  if (/(?:^|:)user:[^:]+$/.test(enqueued)) return "ACCOUNT";

  // Legacy: the segment was the raw address or the raw user id. Removable once
  // every row predating the tagged format has been backfilled.
  const email = capturedEmail ? normalizeRecipientEmail(capturedEmail) : "";
  return email && enqueued.endsWith(`:${email}`) ? "EXTERNAL" : "ACCOUNT";
}

/** True when a key still carries an address, i.e. predates this module. */
export function dedupeKeyContainsAddress(dedupeKey: string): boolean {
  return dedupeKey.includes("@");
}

/**
 * Masks the identity segment of a legacy key before it is shown to an operator
 * or returned from an API. Keys written by `recipientIdentitySegment` carry no
 * address and pass through untouched; rows enqueued before that are not
 * rewritten in place here, because a dedupe key is a uniqueness constraint and
 * changing it would let a duplicate through.
 */
export function maskDedupeKeyForDisplay(dedupeKey: string): string {
  if (!dedupeKeyContainsAddress(dedupeKey)) return dedupeKey;
  return dedupeKey.replace(/(^|:)[^:]*@[^:]*/g, "$1anon:[redacted]");
}
