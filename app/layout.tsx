import type { Metadata } from "next";
import { ThemeProvider, LanguageProvider, KeymapProvider, AuthProvider } from "../shared/contexts";
import ClientLayout from "../components/layout/ClientLayout";
import "./globals.css";

export const metadata: Metadata = {
  title: "Artkit",
  description: "Web-based graphics editor - Sprite Editor, Image Editor, Image Converter",
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
            <KeymapProvider>
              <AuthProvider>
                <ClientLayout>{children}</ClientLayout>
              </AuthProvider>
            </KeymapProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
