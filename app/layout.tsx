import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import LayoutProvider from "@/components/providers/LayoutProvider";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { ToastProvider } from "@/components/ui/Toast";
import StructuredData from "@/components/ui/StructuredData";
import { getOrganizationSchema, getSoftwareApplicationSchema } from "@/lib/config/seo";

// Validate environment variables on startup
import "@/lib/env";

const roboto = Roboto({
  weight: ["300", "400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-roboto",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://openl.app"),
  title: {
    default: "OpenLeague - Free Sports Team Management Platform",
    template: "%s - OpenLeague",
  },
  description:
    "Replace chaotic spreadsheets, group chats, and email chains with a single source of truth for sports team management. Free, open-source, and easy to use.",
  keywords: [
    "sports team management",
    "team organization",
    "roster management",
    "scheduling software",
    "free team management",
    "sports scheduling",
    "team calendar",
    "RSVP tracking",
    "open source sports",
  ],
  authors: [{ name: "OpenLeague Team" }],
  creator: "OpenLeague",
  publisher: "OpenLeague",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      { rel: "android-chrome", url: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { rel: "android-chrome", url: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://openl.app",
    siteName: "OpenLeague",
    title: "OpenLeague - Free Sports Team Management Platform",
    description: "Replace chaotic spreadsheets, group chats, and email chains with a single source of truth for sports team management. Free, open-source, and easy to use.",
    images: [
      {
        url: "/images/og-image.png",
        width: 1200,
        height: 630,
        alt: "OpenLeague - Free Sports Team Management",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@openleague",
    creator: "@openleague",
    title: "OpenLeague - Free Sports Team Management Platform",
    description: "Replace chaotic spreadsheets, group chats, and email chains with a single source of truth for sports team management. Free, open-source, and easy to use.",
    images: ["/images/og-image.png"],
  },
  alternates: {
    canonical: "https://openl.app",
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const umamiWebsiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

  return (
    <html lang="en">
      <head>
        <StructuredData
          data={[getOrganizationSchema(), getSoftwareApplicationSchema()]}
        />
      </head>
      <body className={roboto.variable}>
        {umamiWebsiteId && (
          <Script
            src="https://cloud.umami.is/script.js"
            data-website-id={umamiWebsiteId}
            strategy="afterInteractive"
          />
        )}
        <ErrorBoundary>
          <ThemeProvider>
            <ToastProvider>
              <SessionProvider>
                <LayoutProvider>
                  {children}
                </LayoutProvider>
              </SessionProvider>
            </ToastProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
