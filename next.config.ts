import type { NextConfig } from "next";

const parseBooleanFlag = (value: string | undefined) => {
  if (!value) {
    return false;
  }

  return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
};

const adsEnabled =
  parseBooleanFlag(process.env.NEXT_PUBLIC_ADS_ENABLED) &&
  Boolean(process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_CLIENT?.trim());

const scriptSrc = [
  "'self'",
  "'unsafe-eval'",
  "'unsafe-inline'",
  "https://cloud.umami.is",
  "https://vercel.live",
  ...(adsEnabled ? ["https://pagead2.googlesyndication.com", "https://fundingchoicesmessages.google.com"] : []),
];

const imgSrc = [
  "'self'",
  "data:",
  "blob:",
  ...(adsEnabled ? ["https://pagead2.googlesyndication.com", "https://googleads.g.doubleclick.net", "https://tpc.googlesyndication.com"] : []),
];

const connectSrc = [
  "'self'",
  "https://cloud.umami.is",
  "https://api-gateway.umami.dev",
  ...(adsEnabled ? ["https://pagead2.googlesyndication.com", "https://googleads.g.doubleclick.net", "https://fundingchoicesmessages.google.com"] : []),
];

const frameSrc = [
  "'self'",
  ...(adsEnabled ? ["https://googleads.g.doubleclick.net", "https://tpc.googlesyndication.com", "https://www.google.com"] : []),
];

const nextConfig: NextConfig = {
  compiler: {
    emotion: true,
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

export default nextConfig;
