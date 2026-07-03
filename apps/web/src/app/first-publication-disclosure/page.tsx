import type { Metadata } from "next";
import Link from "next/link";

import {
  FIRST_PUBLICATION_DISCLOSURE_LINES,
  FIRST_PUBLICATION_DISCLOSURE_VERSION,
  MVP_LEGAL_COPY_STATUS_LABEL,
} from "@/lib/privacy/disclosures";

export const metadata: Metadata = {
  title: "MVP first-publication disclosure | OverGarden",
  description:
    "Founder-approved OverGarden MVP disclosure shown before a first public journal publication.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function FirstPublicationDisclosurePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10 sm:px-8">
      <Link href="/" className="text-sm text-muted-foreground">
        OverGarden
      </Link>
      <header className="border-b border-border pb-5">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          MVP first-publication disclosure
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Version {FIRST_PUBLICATION_DISCLOSURE_VERSION}.{" "}
          {MVP_LEGAL_COPY_STATUS_LABEL}.
        </p>
      </header>
      <div className="grid gap-4 text-sm leading-6 text-foreground">
        <p>
          This is the current MVP wording logged when a gardener accepts the
          first publication disclosure. Material wording changes must create a
          new disclosure version before publication logging is considered valid.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          {FIRST_PUBLICATION_DISCLOSURE_LINES.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </main>
  );
}
