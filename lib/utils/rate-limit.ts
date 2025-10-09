import { NextRequest } from "next/server";

// Simple in-memory rate limiter for development
// In production, consider using Redis or a dedicated rate limiting service
//
// NOTE: Development uses more permissive limits to accommodate testing flows
// like signup->signin which trigger multiple auth requests in quick succession
class RateLimiter {
    private requests: Map<string, { count: number; resetTime: number }> = new Map();
    private readonly maxRequests: number;
    private readonly windowMs: number;

    constructor(maxRequests: number = 100, windowMs: number = 15 * 60 * 1000) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
    }

    isAllowed(identifier: string): { allowed: boolean; remaining: number; resetTime: number; limit: number } {
        const now = Date.now();
        const record = this.requests.get(identifier);

        if (!record || now > record.resetTime) {
            // First request or window has expired
            const resetTime = now + this.windowMs;
            this.requests.set(identifier, { count: 1, resetTime });
            return { allowed: true, remaining: this.maxRequests - 1, resetTime, limit: this.maxRequests };
        }

        if (record.count >= this.maxRequests) {
            // Rate limit exceeded
            return { allowed: false, remaining: 0, resetTime: record.resetTime, limit: this.maxRequests };
        }

        // Increment count
        record.count++;
        this.requests.set(identifier, record);
        return { allowed: true, remaining: this.maxRequests - record.count, resetTime: record.resetTime, limit: this.maxRequests };
    }

    // Clean up expired entries periodically
    cleanup() {
        const now = Date.now();
        for (const [key, record] of this.requests.entries()) {
            if (now > record.resetTime) {
                this.requests.delete(key);
            }
        }
    }
}

// Rate limit configuration constants
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const SESSION_LIMIT_PROD = 60;
const SESSION_LIMIT_DEV = 100;

const AUTH_ACTION_LIMIT_PROD = 10;
const AUTH_ACTION_LIMIT_DEV = 50;

const GENERAL_API_LIMIT = 100;

// Global rate limiters for different endpoints
// More permissive limits in development for testing
const isDevelopment = process.env.NODE_ENV !== "production";

// Session checks need to be permissive since Auth.js polls automatically
const sessionLimiter = new RateLimiter(
    isDevelopment ? SESSION_LIMIT_DEV : SESSION_LIMIT_PROD, // 60 requests per 15 min in production (1 every 15 seconds)
    RATE_LIMIT_WINDOW_MS
);

// Strict limits for login/signup to prevent brute force
const authActionLimiter = new RateLimiter(
    isDevelopment ? AUTH_ACTION_LIMIT_DEV : AUTH_ACTION_LIMIT_PROD, // 10 login attempts per 15 min in production
    RATE_LIMIT_WINDOW_MS
);

// General API endpoints
const generalLimiter = new RateLimiter(GENERAL_API_LIMIT, RATE_LIMIT_WINDOW_MS); // 100 requests per 15 minutes for general API

/**
 * Extract client IP address from request headers
 * Checks multiple headers to handle different proxy/CDN configurations
 */
export function getClientIp(request: NextRequest): string {
    const forwarded = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");
    const cfConnectingIp = request.headers.get("cf-connecting-ip"); // Cloudflare

    return forwarded?.split(",")[0]?.trim() || realIp || cfConnectingIp || "unknown";
}

/**
 * Get client identifier for rate limiting
 * Uses IP address with fallback to user agent
 */
function getClientIdentifier(request: NextRequest): string {
    const ip = getClientIp(request);

    // Fallback to user agent if IP is not available
    const userAgent = request.headers.get("user-agent") || "unknown";

    return `${ip}-${userAgent.substring(0, 50)}`; // Limit user agent length
}

/**
 * Rate limit middleware for authentication endpoints
 * Uses more permissive limits for session checks, strict limits for login/signup
 */
export function rateLimitAuth(request: NextRequest) {
    const identifier = getClientIdentifier(request);
    const pathname = request.nextUrl.pathname;

    // Session endpoint gets more permissive rate limiting since Auth.js polls it
    // Use strict equality to avoid unintentional matches
    if (pathname === "/api/auth/session" || pathname === "/api/auth/csrf") {
        return sessionLimiter.isAllowed(identifier);
    }

    // Login, signup, and other auth actions get strict rate limiting
    return authActionLimiter.isAllowed(identifier);
}

/**
 * Rate limit middleware for general API endpoints
 */
export function rateLimitGeneral(request: NextRequest) {
    const identifier = getClientIdentifier(request);
    return generalLimiter.isAllowed(identifier);
}

/**
 * Cleanup expired rate limit entries
 * Should be called periodically (e.g., via cron job)
 */
export function cleanupRateLimiters() {
    sessionLimiter.cleanup();
    authActionLimiter.cleanup();
    generalLimiter.cleanup();
}

// Clean up every 5 minutes
if (typeof window === "undefined") {
    setInterval(cleanupRateLimiters, 5 * 60 * 1000);
}