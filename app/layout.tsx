import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { ThemeProvider, LanguageProvider, AuthProvider } from "../shared/contexts";
import { ToastProvider } from "../shared/components/ToastProvider";
import { ConfirmDialogProvider } from "../shared/components/ConfirmDialogProvider";
import AnalyticsTracker from "@/shared/components/app/layout/AnalyticsTracker";
import ServiceWorkerManager from "@/shared/components/app/layout/ServiceWorkerManager";
import "./globals.css";

const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || "";

export const viewport: Viewport = {
  themeColor: "#FF8C00",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Artkit",
  description: "Web-based graphics editor - Sprite Editor, Image Editor, Image Converter",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Artkit",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        {gaMeasurementId && (
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
            strategy="afterInteractive"
          />
        )}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const theme = localStorage.getItem('dev-tools-theme');
                const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                const isDark = theme === 'dark' || (theme === 'system' && systemDark) || (!theme && systemDark);
                document.documentElement.classList.add(isDark ? 'dark' : 'light');
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased min-h-screen bg-background text-foreground overscroll-x-none">
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <ToastProvider>
                <ConfirmDialogProvider>
                  <AnalyticsTracker />
                  <ServiceWorkerManager />
                  {children}
                </ConfirmDialogProvider>
              </ToastProvider>
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
