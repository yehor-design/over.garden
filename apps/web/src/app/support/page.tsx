import type { Metadata } from "next";
import Link from "next/link";

import {
  MVP_LEGAL_COPY_STATUS_LABEL,
  SUPPORT_EMAIL,
} from "@/lib/privacy/disclosures";

export const metadata: Metadata = {
  title: "Support and privacy contact | OverGarden",
  description:
    "OverGarden MVP support and privacy contact for account, erasure, and publication questions.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function SupportPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10 sm:px-8">
      <Link href="/" className="text-sm text-muted-foreground">
        OverGarden
      </Link>
      <header className="border-b border-border pb-5">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Support and privacy contact
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          For account access, publication, privacy, or erasure questions, email{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
          . {MVP_LEGAL_COPY_STATUS_LABEL}.
        </p>
      </header>
      <section className="grid gap-3 text-sm leading-6 text-foreground">
        <h2 className="text-base font-semibold text-foreground">
          Common support paths
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>
            Need access to an existing account: start with{" "}
            <Link
              href="/auth/help"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              sign-in help
            </Link>
            .
          </li>
          <li>
            Need account erasure or anonymization review: submit an{" "}
            <Link
              href="/erasure"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              erasure request
            </Link>
            .
          </li>
          <li>
            Want to understand publication, media, and retention boundaries:
            read the{" "}
            <Link
              href="/privacy"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              privacy notice
            </Link>
            .
          </li>
        </ul>
      </section>
    </main>
  );
}
