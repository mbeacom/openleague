import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { ToastProvider } from "@/components/ui/Toast";

// Validate environment variables on startup
import "@/lib/env";

const roboto = Roboto({
  weight: ["300", "400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-roboto",
});

export const metadata: Metadata = {
  title: "OpenLeague - Free Sports Team Management Platform",
  description:
    "Replace chaotic spreadsheets, group chats, and email chains with a single source of truth for sports team management. Free forever.",
  keywords: "sports team management, team organization, roster management, scheduling, free team management software",
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
  openGraph: {
    title: "OpenLeague - Free Sports Team Management Platform",
    description: "Replace chaotic spreadsheets, group chats, and email chains with a single source of truth for sports team management. Free forever.",
    type: "website",
    url: "https://openl.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "OpenLeague - Free Sports Team Management Platform",
    description: "Replace chaotic spreadsheets, group chats, and email chains with a single source of truth for sports team management. Free forever.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={roboto.variable}>
        <ErrorBoundary>
          <ThemeProvider>
            <ToastProvider>
              <SessionProvider>{children}</SessionProvider>
            </ToastProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
