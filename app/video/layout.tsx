import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Video Editor",
  description:
    "Free online video editor with timeline, multi-track editing, and masking. Edit videos right in your browser.",
};

export default function VideoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
