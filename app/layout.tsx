import type { Metadata } from "next";
import { ThemeProvider, LanguageProvider } from "../shared/contexts";
import Sidebar from "../components/layout/Sidebar";
import Footer from "../components/layout/Footer";
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
            <div className="flex h-screen">
              <Sidebar />
              <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
                <Footer />
              </div>
            </div>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
