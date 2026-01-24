import type { Metadata } from "next";
import { ThemeProvider } from "../contexts/ThemeContext";
import Sidebar from "../components/layout/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dev Tools",
  description: "개발 도구 모음 - 스프라이트 에디터, 이미지 변환기",
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
          <div className="flex h-screen">
            <Sidebar />
            <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
