/**
 * Additional input sanitization utilities
 * These complement the Zod validation schemas
 *
 * NOTE: These functions are currently not actively used in the codebase because:
 * - Prisma ORM provides comprehensive SQL injection protection through parameterized queries
 * - Zod validation schemas handle input validation and sanitization (trimming, lowercasing, etc.)
 * - React's JSX provides built-in XSS protection through automatic escaping
 *
 * These utilities remain available for defense-in-depth scenarios where additional
 * sanitization layers may be beneficial, such as:
 * - User-generated content that may contain HTML
 * - Legacy code integration
 * - Additional security requirements
 * - Third-party data processing
 */

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "`": "&#x60;",
  "=": "&#x3D;",
  "/": "&#x2F;",
};

const HTML_ESCAPE_PATTERN = /[&<>"'`=/]/g;
const UNSAFE_CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const HTML_ATTRIBUTE_WHITESPACE_PATTERN = /[\t\n\f\r ]+/g;
const URL_SCHEME_PATTERN = /^([a-zA-Z][a-zA-Z\d+.-]*):/;
const URL_SCHEME_NORMALIZATION_PATTERN = /[\u0000-\u0020\u007F-\u009F]+/g;
const DEFAULT_SAFE_URL_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

export type SanitizeUrlOptions = {
  allowedProtocols?: readonly string[];
  allowRelative?: boolean;
};

function stripUnsafeControlCharacters(input: string): string {
  return input.replace(UNSAFE_CONTROL_CHAR_PATTERN, "");
}

function normalizeProtocol(protocol: string): string {
  return protocol.trim().toLowerCase().replace(/:?$/, ":");
}

/**
 * Escape potentially dangerous HTML/script content for text contexts.
 *
 * This intentionally encodes markup instead of attempting to remove tags or
 * URL schemes with regexes. Regex-based HTML filtering is easy to bypass and
 * can create new dangerous strings as pieces are removed.
 */
export function escapeHtml(input: string): string {
  return stripUnsafeControlCharacters(input).replace(
    HTML_ESCAPE_PATTERN,
    (character) => HTML_ESCAPE_MAP[character] ?? "",
  );
}

/**
 * @deprecated Prefer escapeHtml() for new code. This name is retained for
 * compatibility with older call sites that treated sanitization as escaping.
 */
export function sanitizeHtml(input: string): string {
  return escapeHtml(input);
}

/**
 * Escape text for use inside quoted HTML attributes.
 */
export function escapeHtmlAttribute(input: string): string {
  return escapeHtml(input).replace(HTML_ATTRIBUTE_WHITESPACE_PATTERN, " ").trim();
}

/**
 * Validate and normalize a URL intended for href/src-style attributes using a
 * protocol allowlist.
 *
 * This does not HTML-escape the returned string. Use the result through React
 * props/DOM properties, or pass it through escapeHtmlAttribute() before manual
 * HTML string interpolation.
 *
 * Returns null when the URL is empty, rejected by parsing or policy, contains
 * browser-normalized backslashes, is protocol-relative, or uses an unsafe scheme
 * such as javascript:, data:, vbscript:, or whitespace-obfuscated variants like
 * java\nscript:.
 */
export function sanitizeUrl(input: string, options: SanitizeUrlOptions = {}): string | null {
  const allowedProtocols = new Set(
    (options.allowedProtocols ?? [...DEFAULT_SAFE_URL_PROTOCOLS]).map(normalizeProtocol),
  );
  const allowRelative = options.allowRelative ?? true;
  const value = stripUnsafeControlCharacters(input).trim();

  if (!value || value.startsWith("//") || value.includes("\\")) {
    return null;
  }

  const normalizedForSchemeCheck = value.replace(URL_SCHEME_NORMALIZATION_PATTERN, "");
  const schemeMatch = normalizedForSchemeCheck.match(URL_SCHEME_PATTERN);

  if (!schemeMatch) {
    return allowRelative && !value.startsWith("\\") ? value : null;
  }

  const protocol = normalizeProtocol(schemeMatch[1]);

  if (!allowedProtocols.has(protocol)) {
    return null;
  }

  try {
    return new URL(value).href;
  } catch {
    return protocol === "mailto:" || protocol === "tel:" ? value : null;
  }
}

/**
 * Sanitize SQL-like input.
 *
 * Do not use this as SQL injection protection. Prisma parameterized queries are
 * the real protection layer. This helper only exists for legacy defense-in-depth
 * text cleanup where intentionally removing SQL-looking tokens is acceptable.
 */
export function sanitizeSqlInput(input: string): string {
  return stripUnsafeControlCharacters(input)
    .replace(/['";]/g, "") // Remove quotes and semicolons
    .replace(/--/g, "") // Remove SQL comments
    .replace(/\/\*/g, "") // Remove block comment start
    .replace(/\*\//g, "") // Remove block comment end
    .replace(/\bUNION\b/gi, "") // Remove UNION keyword
    .replace(/\bSELECT\b/gi, "") // Remove SELECT keyword
    .replace(/\bINSERT\b/gi, "") // Remove INSERT keyword
    .replace(/\bUPDATE\b/gi, "") // Remove UPDATE keyword
    .replace(/\bDELETE\b/gi, "") // Remove DELETE keyword
    .replace(/\bDROP\b/gi, ""); // Remove DROP keyword
}

/**
 * Normalize email addresses
 * Convert to lowercase and trim whitespace
 */
export function normalizeEmail(email: string): string {
  return stripUnsafeControlCharacters(email).trim().toLowerCase();
}

/**
 * Sanitize phone numbers
 * Keep digits plus common phone punctuation, then collapse whitespace.
 */
export function sanitizePhoneNumber(phone: string): string {
  return stripUnsafeControlCharacters(phone)
    .replace(/[^\d+\-().\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Validate and sanitize CUID format
 * Ensure it matches the expected CUID pattern
 */
export function validateCuid(id: string): boolean {
  const cuidRegex = /^c[a-z0-9]{24}$/;
  return cuidRegex.test(id);
}

/**
 * Legacy text cleanup before storage; not SQL injection protection.
 *
 * Prefer storing validated plain text and escaping at render time. Use this only
 * when callers intentionally want HTML-escaped text persisted at rest.
 */
export function sanitizeForDatabase(input: string): string {
  return escapeHtml(sanitizeSqlInput(input.trim()));
}

/**
 * Rate limiting key sanitization
 * Ensure rate limiting keys are safe
 */
export function sanitizeRateLimitKey(key: string): string {
  return stripUnsafeControlCharacters(key).replace(/[^a-zA-Z0-9\-_.]/g, "").substring(0, 100);
}
