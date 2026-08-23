import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { tryResolveVisualFixtureEnvironment } from "@/lib/visual-fixtures/environment";
import { AtomicJournalCodecFixture } from "./atomic-journal-codec-fixture";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Atomic journal codec fixture | OverGarden",
  robots: { index: false, follow: false },
};

/** Local/preview-only and mutation-free browser harness for OVE-347. */
export default function AtomicJournalCodecFixturePage() {
  if (!tryResolveVisualFixtureEnvironment(process.env)) notFound();
  return <AtomicJournalCodecFixture />;
}
