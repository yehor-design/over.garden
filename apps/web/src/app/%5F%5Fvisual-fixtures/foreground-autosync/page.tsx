import { notFound } from "next/navigation";

import type { InterfaceLocale } from "@/lib/interface-localization";
import { tryResolveVisualFixtureEnvironment } from "@/lib/visual-fixtures/environment";
import { ForegroundAutosyncVisualFixture } from "./foreground-autosync-visual-fixture";

export const dynamic = "force-dynamic";

/** Local/preview-only, synthetic browser harness for OVE-289 foreground sync. */
export default async function ForegroundAutosyncVisualFixturePage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<{ locale?: string }>;
}) {
  if (!tryResolveVisualFixtureEnvironment(process.env)) notFound();
  const query = await searchParams;
  const locale: InterfaceLocale =
    query.locale === "bg" || query.locale === "ru" ? query.locale : "uk";

  return <ForegroundAutosyncVisualFixture locale={locale} />;
}
