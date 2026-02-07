import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sound Editor",
  description:
    "Free online sound editor for waveform editing and audio format conversion. Edit audio files right in your browser.",
};

export default function SoundLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
