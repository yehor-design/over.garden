import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "First-publication disclosure placeholder | OverGarden",
  robots: {
    index: false,
    follow: false,
  },
};

export default function FirstPublicationDisclosurePlaceholderPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10 sm:px-8">
      <Link href="/" className="text-sm text-muted-foreground">
        OverGarden
      </Link>
      <header className="border-b border-border pb-5">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          First-publication disclosure placeholder
        </h1>
      </header>
      <div className="grid gap-4 text-sm leading-6 text-foreground">
        <p>
          Placeholder disclosure text for the first time a gardener publishes a
          journal entry.
        </p>
        <p>
          Reviewed public-content visibility, media derivative, location,
          deletion, indexing, and data-use wording must be added before public
          release.
        </p>
      </div>
    </main>
  );
}
