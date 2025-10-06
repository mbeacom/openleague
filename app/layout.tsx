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
  title: "OpenLeague - Team Management Platform",
  description:
    "Free sports team management platform. Simplify rostering, scheduling, and communication for your team.",
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
