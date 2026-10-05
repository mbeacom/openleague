/**
 * A URL slug derived from a display name: lowercase alphanumerics joined by
 * single hyphens, at most 60 characters, with no leading or trailing hyphen.
 * Falls back to "association" when nothing usable remains.
 */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 60)
    // Trim after the cut so a separator at the 60th character is not kept.
    .replace(/-+$/, "") || "association";
}
