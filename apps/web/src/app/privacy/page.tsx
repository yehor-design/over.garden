import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy placeholder | OverGarden",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PrivacyPlaceholderPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10 sm:px-8">
      <Link href="/" className="text-sm text-muted-foreground">
        OverGarden
      </Link>
      <header className="border-b border-border pb-5">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Privacy placeholder
        </h1>
      </header>
      <div className="grid gap-4 text-sm leading-6 text-foreground">
        <p>
          Placeholder legal text for GDPR/privacy disclosure during MVP
          development.
        </p>
        <p>
          Reviewed privacy text, processor details, data rights, retention
          rules, and contact instructions must be added before public release.
        </p>
      </div>
    </main>
  );
}
