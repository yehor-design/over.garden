import { notFound } from "next/navigation";

import type { InterfaceLocale } from "@/lib/interface-localization";
import { tryResolveVisualFixtureEnvironment } from "@/lib/visual-fixtures/environment";
import { LegacyDeviceRetirementVisualFixture } from "./legacy-device-retirement-visual-fixture";

export const dynamic = "force-dynamic";

export default async function LegacyDeviceRetirementVisualFixturePage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<{ locale?: string; scenario?: string }>;
}) {
  if (!tryResolveVisualFixtureEnvironment(process.env)) notFound();
  const query = await searchParams;
  const locale: InterfaceLocale =
    query.locale === "bg" || query.locale === "ru" ? query.locale : "uk";
  const scenario = isScenario(query.scenario) ? query.scenario : "happy";

  return (
    <LegacyDeviceRetirementVisualFixture locale={locale} scenario={scenario} />
  );
}

function isScenario(
  value: string | undefined,
): value is "happy" | "blocked" | "unavailable" | "slow" | "another" {
  return ["happy", "blocked", "unavailable", "slow", "another"].includes(
    value ?? "",
  );
}
