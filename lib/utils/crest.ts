/**
 * Crest identity: the visual system that lets a team, league, association, or
 * venue be recognized at a glance before anyone has uploaded a logo.
 *
 * Two problems this solves. First, most entities will never have a logo — a
 * beer-league team is not commissioning artwork — so the fallback has to be
 * good on its own, not a placeholder. Second, a monogram in one brand color
 * turns a division of twenty teams into twenty identical blue circles, which
 * is worse than no crest at all.
 *
 * So the fallback color is derived from the entity id: stable forever, distinct
 * between neighbors, and drawn from a fixed jersey palette rather than a hue
 * rotation. A curated set is the point — every entry is dark enough to carry
 * white text at >= 4.5:1, which a computed hue cannot promise.
 */

/**
 * Jersey palette. Deep, saturated, athletic; all pass WCAG AA against white
 * text. Order is load-bearing only in that it must never be rearranged —
 * doing so would silently re-color every existing crest in the product.
 */
export const CREST_PALETTE = [
  "#0D47A1", // league blue
  "#00695C", // deep teal
  "#1B5E20", // forest
  "#9B1B30", // maroon
  "#B23A0E", // burnt orange
  "#37474F", // slate
  "#303F9F", // indigo
  "#6A1B7A", // plum
  "#155E75", // harbor
  "#5D4037", // bronze
  "#1A237E", // navy
  "#4E342E", // cocoa
] as const;

/**
 * FNV-1a, 32-bit. Chosen over anything fancier because it has to produce the
 * identical index on the server and in the browser — a mismatch here is a
 * hydration error, not a cosmetic wobble.
 */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    // 32-bit FNV prime multiply, kept in range via Math.imul.
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The stable fallback crest color for an entity. */
export function crestColorForId(id: string): string {
  if (!id) return CREST_PALETTE[0];
  return CREST_PALETTE[hashString(id) % CREST_PALETTE.length];
}

/**
 * The color a crest actually paints with: an owner's chosen brand color when
 * they set one, otherwise the derived jersey color.
 */
export function resolveCrestColor(
  id: string,
  brandColor?: string | null,
): string {
  const trimmed = brandColor?.trim();
  if (trimmed && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) {
    return trimmed;
  }
  return crestColorForId(id);
}

/**
 * Up to two letters standing in for a name.
 *
 * Multi-word names take one letter per word ("Ice Breakers" -> "IB");
 * single-word names take two ("Storm" -> "ST"), because a lone letter in a
 * large circle reads as an error rather than a mark.
 *
 * Tokens that start with a digit are dropped first. Youth sport names are full
 * of age and birth-year brackets — "18U Storm", "2010 Bruins" — and those
 * qualify the team rather than name it, so "1S" would be a mark for the
 * division, not the club. If dropping them leaves nothing, they are all we
 * have and they stand ("49ers" -> "49").
 */
export function crestInitials(name: string): string {
  const words = name
    .split(/[\s/_-]+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);

  const named = words.filter((word) => !/^\p{N}/u.test(word));
  const source = named.length > 0 ? named : words;

  if (source.length === 0) return "?";
  if (source.length === 1) {
    return source[0].slice(0, 2).toUpperCase();
  }
  return (source[0][0] + source[1][0]).toUpperCase();
}
