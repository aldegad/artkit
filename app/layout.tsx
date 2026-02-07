import type { Metadata } from "next";
import { ThemeProvider, LanguageProvider, AuthProvider } from "../shared/contexts";
import ClientLayout from "../components/layout/ClientLayout";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Artkit - Web-based Creative Toolkit",
    template: "%s | Artkit",
  },
  description:
    "Free web-based creative tools. Edit images, video, sprites, and sound right in your browser. No installation required.",
  keywords: [
    "image editor",
    "video editor",
    "sprite editor",
    "sound editor",
    "online editor",
    "web tools",
    "image converter",
    "pixel art",
  ],
  authors: [{ name: "Soo Hong Kim" }],
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "https://artkit.web.app",
    siteName: "Artkit",
    title: "Artkit - Web-based Creative Toolkit",
    description:
      "Free web-based creative tools for images, video, sprites, and sound.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Artkit - Web-based Creative Toolkit",
    description:
      "Free web-based creative tools for images, video, sprites, and sound.",
  },
  robots: { index: true, follow: true },
  metadataBase: new URL("https://artkit.web.app"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "Artkit",
              url: "https://artkit.web.app",
              description:
                "Free web-based creative tools for images, video, sprites, and sound.",
              applicationCategory: "MultimediaApplication",
              operatingSystem: "Web Browser",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "USD",
              },
            }),
          }}
        />
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
      <body className="antialiased min-h-screen bg-background text-foreground">
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <ClientLayout>{children}</ClientLayout>
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
