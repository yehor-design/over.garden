import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { tryResolveVisualFixtureEnvironment } from "@/lib/visual-fixtures/environment";
import { LexicalJournalVisualFixture } from "./lexical-journal-visual-fixture";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lexical journal fixture | OverGarden",
  robots: { index: false, follow: false },
};

/** Local/preview-only and mutation-free browser harness for OVE-317. */
export default async function LexicalJournalVisualFixturePage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<{ density?: string; locale?: string }>;
}) {
  if (!tryResolveVisualFixtureEnvironment(process.env)) notFound();
  const query = await searchParams;
  const locale =
    query.locale === "bg" || query.locale === "ru" ? query.locale : "uk";
  return (
    <LexicalJournalVisualFixture
      locale={locale}
      dense={query.density === "100"}
    />
  );
}
