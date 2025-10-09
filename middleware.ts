import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimitAuth, rateLimitGeneral, getClientIp } from "@/lib/utils/rate-limit";

export function middleware(request: NextRequest) {
    // Enforce HTTPS in production
    if (
        process.env.NODE_ENV === "production" &&
        request.headers.get("x-forwarded-proto") !== "https"
    ) {
        const httpsUrl = new URL(request.url);
        httpsUrl.protocol = "https:";
        return NextResponse.redirect(httpsUrl, 301);
    }

    // Apply rate limiting to API routes (more permissive in development)
    if (request.nextUrl.pathname.startsWith("/api/")) {
        let rateLimitResult;

        // Use stricter rate limiting for auth endpoints
        if (request.nextUrl.pathname.startsWith("/api/auth/")) {
            rateLimitResult = rateLimitAuth(request);
        } else {
            rateLimitResult = rateLimitGeneral(request);
        }

        if (!rateLimitResult.allowed) {
            const retryAfter = Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000);

            // Log rate limit hits for monitoring (in production too, to track issues)
            console.warn(`[RATE_LIMIT] ${request.nextUrl.pathname} - IP: ${getClientIp(request)} - Retry after ${retryAfter}s`);

            return new NextResponse(
                JSON.stringify({
                    error: "Too many requests",
                    message: "Rate limit exceeded. Please try again later.",
                }),
                {
                    status: 429,
                    headers: {
                        "Content-Type": "application/json",
                        "X-RateLimit-Limit": rateLimitResult.limit.toString(),
                        "X-RateLimit-Remaining": "0",
                        "X-RateLimit-Reset": new Date(rateLimitResult.resetTime).toISOString(),
                        "Retry-After": retryAfter.toString(),
                    },
                }
            );
        }

        // Add rate limit headers to successful responses
        const response = NextResponse.next();
        response.headers.set("X-RateLimit-Limit", rateLimitResult.limit.toString());
        response.headers.set("X-RateLimit-Remaining", rateLimitResult.remaining.toString());
        response.headers.set("X-RateLimit-Reset", new Date(rateLimitResult.resetTime).toISOString());

        return response;
    }

    // Add security headers to all responses
    const response = NextResponse.next();

    // Additional security headers that can't be set in next.config.ts
    response.headers.set("X-Robots-Tag", "noindex, nofollow");

    return response;
}

export const config = {
    // Apply middleware to all routes except static files
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        "/((?!_next/static|_next/image|favicon.ico).*)",
    ],
};