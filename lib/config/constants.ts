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
 * Authentication error codes (used in CredentialsSignin.code for Auth.js v5)
 */
export const AUTH_ERROR_CODES = {
  INVALID_CREDENTIALS: "invalid_credentials",
  ACCOUNT_NOT_APPROVED: "account_not_approved",
  EMAIL_NOT_VERIFIED: "email_not_verified",
} as const;

/**
 * Authentication and authorization messages
 */
export const AUTH_MESSAGES = {
  SIGNUP_CHECK_EMAIL: "signup_check_email",
  SIGNUP_READY: "signup_ready",
  PASSWORD_RESET_SUCCESS: "password_reset_success",
  EMAIL_CHANGED: "email_changed",
  EMAIL_CHANGED_MESSAGE: "Email address updated — log in with your new email.",
  CHECK_EMAIL_MESSAGE: "Account created! We've sent you a verification link — check your email, then log in.",
  SIGNUP_READY_MESSAGE: "Account created! You can log in now.",
  EMAIL_VERIFIED_MESSAGE: "Email verified — you can now log in.",
  VERIFICATION_INVALID_MESSAGE: "That verification link is invalid or has expired. Log in to request a new one.",
  PASSWORD_RESET_SUCCESS_MESSAGE: "Password updated! Log in with your new password.",
  EMAIL_NOT_VERIFIED: "Please verify your email address first. Check your inbox for the verification link, or resend it below.",
  ACCOUNT_NOT_APPROVED: "This account has been suspended. Please contact support.",
} as const;
