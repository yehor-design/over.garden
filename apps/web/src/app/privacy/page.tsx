import type { Metadata } from "next";
import Link from "next/link";

import {
  ERASURE_REQUEST_INTAKE_VERSION,
  FIRST_PUBLICATION_DISCLOSURE_VERSION,
  PILOT_LEGAL_COPY_STATUS,
  PILOT_LEGAL_COPY_STATUS_LABEL,
  PILOT_PUBLIC_RELEASE_BLOCKERS,
} from "@/lib/privacy/disclosures";

export const metadata: Metadata = {
  title: "Pilot privacy notice | OverGarden",
  description:
    "Closed-pilot privacy notice for OverGarden privacy, publication, and erasure controls.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PrivacyNoticePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10 sm:px-8">
      <Link href="/" className="text-sm text-muted-foreground">
        OverGarden
      </Link>
      <header className="border-b border-border pb-5">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Pilot privacy notice
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          This closed-pilot notice documents the product behavior that is active
          today. It is reviewed for supervised pilot use, while public release
          remains blocked on final legal/process review.
        </p>
      </header>
      <div className="grid gap-4 text-sm leading-6 text-foreground">
        <p>
          Status: <strong>{PILOT_LEGAL_COPY_STATUS_LABEL}</strong> (
          {PILOT_LEGAL_COPY_STATUS}).
        </p>
        <section className="grid gap-2">
          <h2 className="text-base font-semibold text-foreground">
            Current pilot controls
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            <li>Precise location is not collected or rendered in v0.</li>
            <li>
              Public media uses server-cleaned copies; original uploads are not
              public page assets.
            </li>
            <li>
              Public pages are not listed for search engines unless explicit
              promotion rules allow indexing.
            </li>
            <li>
              Archived public entries return 410 Gone at their previous public
              URL.
            </li>
            <li>
              Erasure requests use non-destructive intake version{" "}
              {ERASURE_REQUEST_INTAKE_VERSION}.
            </li>
          </ul>
        </section>
        <section className="grid gap-2">
          <h2 className="text-base font-semibold text-foreground">
            Public release blockers
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            {PILOT_PUBLIC_RELEASE_BLOCKERS.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </section>
        <section className="grid gap-2">
          <h2 className="text-base font-semibold text-foreground">
            Related controls
          </h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/erasure"
              className="text-primary underline-offset-4 hover:underline"
            >
              Request data erasure
            </Link>
            <Link
              href="/first-publication-disclosure"
              className="text-primary underline-offset-4 hover:underline"
            >
              First publication disclosure{" "}
              {FIRST_PUBLICATION_DISCLOSURE_VERSION}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
