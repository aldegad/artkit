import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sprite Editor",
  description:
    "Free online sprite sheet editor for frame extraction and animation preview. Create sprite sheets in your browser.",
};

export default function SpriteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
