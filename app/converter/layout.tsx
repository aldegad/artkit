import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Image Converter",
  description:
    "Free online image format converter. Convert between WebP, PNG, and JPEG with quality control. Batch conversion supported.",
};

export default function ConverterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
