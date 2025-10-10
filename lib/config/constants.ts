/**
 * Application-wide constants
 *
 * This file contains shared constants used across the application
 * to ensure consistency and ease of maintenance.
 */

/**
 * Application domain and branding
 */
export const APP_DOMAIN = "openl.app";
export const APP_NAME = "OpenLeague";
export const APP_URL = `https://${APP_DOMAIN}`;

/**
 * Email configuration
 */
export const DEFAULT_EMAIL_FROM = `noreply@${APP_DOMAIN}`;
export const SUPPORT_EMAIL = `support@${APP_DOMAIN}`;
export const SECURITY_EMAIL = `security@${APP_DOMAIN}`;

/**
 * Contact emails
 */
export const CONTACT_EMAIL = `mark@${APP_DOMAIN}`;

/**
 * External links
 */
export const DOCS_URL = "https://openleague.dev";

/**
 * Authentication and authorization messages
 */
export const AUTH_MESSAGES = {
  SIGNUP_PENDING_APPROVAL: "signup_pending_approval",
  ACCOUNT_PENDING_MESSAGE: "Account created successfully! Your account is pending approval. You'll be able to log in once an administrator approves your account.",
  ACCOUNT_NOT_APPROVED: "Your account is pending approval. Please contact an administrator.",
} as const;
