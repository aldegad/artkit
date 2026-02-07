import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Image Editor",
  description:
    "Free online image editor with layers, brushes, AI background removal, and more. Edit images right in your browser.",
};

export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
