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

/**
 * Remove potentially dangerous HTML/script content
 * Basic XSS prevention for text fields
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") // Remove script tags
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "") // Remove iframe tags
    .replace(/javascript:/gi, "") // Remove javascript: URLs
    .replace(/on\w+\s*=/gi, "") // Remove event handlers like onclick=
    .replace(/data:/gi, ""); // Remove data: URLs
}

/**
 * Sanitize SQL-like input (though Prisma handles this, extra safety)
 * Remove common SQL injection patterns
 */
export function sanitizeSqlInput(input: string): string {
  return input
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
  return email.trim().toLowerCase();
}

/**
 * Sanitize phone numbers
 * Remove non-numeric characters except +, -, (, ), and spaces
 */
export function sanitizePhoneNumber(phone: string): string {
  return phone.replace(/[^\d+\-() ]/g, "").trim();
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
 * Sanitize text for safe database storage
 * Combines multiple sanitization methods
 */
export function sanitizeForDatabase(input: string): string {
  return sanitizeSqlInput(sanitizeHtml(input.trim()));
}

/**
 * Rate limiting key sanitization
 * Ensure rate limiting keys are safe
 */
export function sanitizeRateLimitKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9\-_.]/g, "").substring(0, 100);
}