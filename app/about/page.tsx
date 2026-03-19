import Link from "next/link";

export const metadata = {
  title: "About | Artkit",
  description: "About Artkit - Web-based graphics editor",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6">
      <div className="max-w-lg text-center space-y-4">
        <h1 className="text-2xl font-semibold">About Artkit</h1>
        <p className="text-text-secondary">
          Artkit is a web-based graphics editor for sprites, images, video, audio, and more.
        </p>
        <Link
          href="/"
          className="inline-block mt-4 px-4 py-2 rounded bg-accent-primary text-white hover:opacity-90 transition-opacity"
        >
          ← Home
        </Link>
      </div>
    </div>
  );
}
