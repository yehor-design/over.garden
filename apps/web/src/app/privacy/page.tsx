import type { Metadata } from "next";
import Link from "next/link";

import {
  ERASURE_REQUEST_INTAKE_VERSION,
  FIRST_PUBLICATION_DISCLOSURE_VERSION,
  MVP_LEGAL_COPY_BOUNDARIES,
  MVP_LEGAL_COPY_REVIEW_NOTE,
  MVP_LEGAL_COPY_STATUS,
  MVP_LEGAL_COPY_STATUS_LABEL,
  MVP_OPERATOR_EVIDENCE_FORBIDDEN_FIELDS,
  MVP_RETENTION_RULES,
  SUPPORT_EMAIL,
} from "@/lib/privacy/disclosures";
import { MetaMarketingPrivacyControls } from "@/app/meta-marketing";

export const metadata: Metadata = {
  title: "MVP privacy notice | OverGarden",
  description:
    "Founder-approved MVP privacy notice for OverGarden publication, support, erasure, and data retention controls.",
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
          MVP privacy notice
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          This notice documents the current OverGarden MVP behavior for public
          pages, support, erasure, and data retention. {MVP_LEGAL_COPY_REVIEW_NOTE}
        </p>
      </header>
      <div className="grid gap-4 text-sm leading-6 text-foreground">
        <p>
          Status: <strong>{MVP_LEGAL_COPY_STATUS_LABEL}</strong> (
          {MVP_LEGAL_COPY_STATUS}).
        </p>
        <section className="grid gap-2">
          <h2 className="text-base font-semibold text-foreground">
            Current MVP controls
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            <li>
              Precise location is not collected or rendered; only supported
              coarse regions can appear when a gardener chooses region
              visibility.
            </li>
            <li>
              Public media uses server-cleaned copies; original uploads are not
              public page assets.
            </li>
            <li>
              Useful first-party editorial, guide, answer, and landing pages
              can be indexed for MVP launch. Thin, unsafe, or user-generated
              public surfaces stay out of sitemaps unless explicit promotion
              rules allow indexing.
            </li>
            <li>
              Archived public entries stop showing the journal text at their
              previous public URL, leave public discovery surfaces, and are
              queued for public search removal. External crawler, search-engine,
              or AI copies are removal best-effort only.
            </li>
            <li>
              Erasure requests use operator-reviewed intake version{" "}
              {ERASURE_REQUEST_INTAKE_VERSION}; submitting the form never
              deletes data automatically.
            </li>
          </ul>
        </section>
        <section className="grid gap-2">
          <h2 className="text-base font-semibold text-foreground">
            Data retention
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            {MVP_RETENTION_RULES.map((rule) => (
              <li key={rule.title}>
                <strong>{rule.title}:</strong> {rule.summary}
              </li>
            ))}
          </ul>
        </section>
        <section className="grid gap-2">
          <h2 className="text-base font-semibold text-foreground">
            Operator evidence limits
          </h2>
          <p className="text-muted-foreground">
            Support, smoke, audit, and erasure evidence must not include{" "}
            {formatList(MVP_OPERATOR_EVIDENCE_FORBIDDEN_FIELDS)}.
          </p>
        </section>
        <MetaMarketingPrivacyControls />
        <section className="grid gap-2">
          <h2 className="text-base font-semibold text-foreground">
            Review boundaries
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            {MVP_LEGAL_COPY_BOUNDARIES.map((boundary) => (
              <li key={boundary}>{boundary}</li>
            ))}
          </ul>
        </section>
        <section className="grid gap-2">
          <h2 className="text-base font-semibold text-foreground">
            Support and privacy contact
          </h2>
          <p className="text-muted-foreground">
            For privacy, erasure, or account support, email{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
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
              href="/support"
              className="text-primary underline-offset-4 hover:underline"
            >
              Support and privacy contact
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

function formatList(items: readonly string[]) {
  return new Intl.ListFormat("en", {
    style: "long",
    type: "conjunction",
  }).format(items);
}
