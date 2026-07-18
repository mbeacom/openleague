import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import { withSentryConfig } from "@sentry/nextjs";

const parseBooleanFlag = (value: string | undefined) => {
  if (!value) {
    return false;
  }

  return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
};

const adsEnabled =
  parseBooleanFlag(process.env.NEXT_PUBLIC_ADS_ENABLED) &&
  Boolean(process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_CLIENT?.trim());
const gaEnabled = Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim());
const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim());

const scriptSrc = [
  "'self'",
  "'unsafe-eval'",
  "'unsafe-inline'",
  "https://cloud.umami.is",
  ...(gaEnabled ? ["https://www.googletagmanager.com"] : []),
  "https://vercel.live",
  ...(adsEnabled ? ["https://pagead2.googlesyndication.com", "https://fundingchoicesmessages.google.com"] : []),
];

const imgSrc = [
  "'self'",
  "data:",
  "blob:",
  ...(gaEnabled ? ["https://www.google-analytics.com", "https://*.google-analytics.com"] : []),
  ...(adsEnabled ? ["https://pagead2.googlesyndication.com", "https://googleads.g.doubleclick.net", "https://tpc.googlesyndication.com"] : []),
];

const connectSrc = [
  "'self'",
  "https://cloud.umami.is",
  "https://api-gateway.umami.dev",
  ...(sentryEnabled ? ["https://*.ingest.sentry.io", "https://*.ingest.us.sentry.io", "https://*.ingest.de.sentry.io"] : []),
  ...(gaEnabled ? ["https://www.google-analytics.com", "https://*.google-analytics.com", "https://region1.google-analytics.com"] : []),
  ...(adsEnabled ? ["https://pagead2.googlesyndication.com", "https://googleads.g.doubleclick.net", "https://fundingchoicesmessages.google.com"] : []),
];

const frameSrc = [
  "'self'",
  ...(adsEnabled ? ["https://googleads.g.doubleclick.net", "https://tpc.googlesyndication.com", "https://www.google.com"] : []),
];

const PUBLIC_ASSET_CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=31536000";
const REVALIDATING_CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";
const SERVICE_WORKER_CACHE_CONTROL = "public, max-age=0, must-revalidate";
const cacheControlHeader = (value: string) => [
  {
    key: "Cache-Control",
    value,
  },
];
const staticIconSources = [
  "/favicon.ico",
  "/favicon-16x16.png",
  "/favicon-32x32.png",
  "/android-chrome-192x192.png",
  "/android-chrome-512x512.png",
  "/apple-touch-icon.png",
];

const nextConfig: NextConfig = {
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
  compiler: {
    emotion: true,
  },
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 604800,
  },
  modularizeImports: {
    "@mui/material": {
      transform: "@mui/material/{{member}}",
    },
    "@mui/icons-material": {
      transform: "@mui/icons-material/{{member}}",
    },
  },
  // Security headers (Requirement 10.6)
  async headers() {
    return [
      {
        source: "/images/:path*",
        headers: cacheControlHeader(PUBLIC_ASSET_CACHE_CONTROL),
      },
      ...staticIconSources.map((source) => ({
        source,
        headers: cacheControlHeader(PUBLIC_ASSET_CACHE_CONTROL),
      })),
      {
        source: "/site.webmanifest",
        headers: cacheControlHeader(REVALIDATING_CACHE_CONTROL),
      },
      {
        source: "/offline.html",
        headers: cacheControlHeader(REVALIDATING_CACHE_CONTROL),
      },
      {
        source: "/sw.js",
        headers: cacheControlHeader(SERVICE_WORKER_CACHE_CONTROL),
      },
      {
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src ${scriptSrc.join(" ")}`,
              "style-src 'self' 'unsafe-inline' fonts.googleapis.com", // MUI requires unsafe-inline
              "font-src 'self' fonts.gstatic.com",
              `img-src ${imgSrc.join(" ")}`,
              `connect-src ${connectSrc.join(" ")}`,
              `frame-src ${frameSrc.join(" ")}`,
              "worker-src 'self'",
              "frame-ancestors 'self'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

const withMDX = createMDX({});

// Sentry is fully inert without env config: no DSN → no runtime init (see
// sentry.*.config.ts / instrumentation-client.ts), no auth token → no source-map
// upload. The wrapper itself is safe to apply unconditionally.
export default withSentryConfig(withMDX(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  telemetry: false,
  disableLogger: true,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
