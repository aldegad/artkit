import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Icon Showcase",
  description:
    "Browse, search, and download SVG icons. Copy SVG code or download as PNG. Free icon library for developers.",
};

export default function IconsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
