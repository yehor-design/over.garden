import { notFound } from "next/navigation";

import type { InterfaceLocale } from "@/lib/interface-localization";
import { tryResolveVisualFixtureEnvironment } from "@/lib/visual-fixtures/environment";
import { SessionRecheckVisualFixture } from "./session-recheck-visual-fixture";

export const dynamic = "force-dynamic";

/**
 * Local/preview-only browser harness for the SessionConvergenceBoundary race.
 * It contains synthetic markup only and remains unavailable outside the
 * already fail-closed visual-fixture environment.
 */
export default async function SessionRecheckVisualFixturePage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<{
    initial?: string;
    locale?: string;
    mode?: string;
  }>;
}) {
  if (!tryResolveVisualFixtureEnvironment(process.env)) notFound();
  const query = await searchParams;
  const locale: InterfaceLocale =
    query.locale === "bg" || query.locale === "ru" ? query.locale : "uk";

  return (
    <SessionRecheckVisualFixture
      initialRead={query.initial === "stall" ? "stall" : "exact"}
      locale={locale}
      recheckMode={
        query.mode === "compatibility"
          ? "compatibility_fenced"
          : "effect_closed_non_fencing"
      }
    />
  );
}
