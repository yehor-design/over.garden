import { notFound } from "next/navigation";

import type { InterfaceLocale } from "@/lib/interface-localization";
import { tryResolveVisualFixtureEnvironment } from "@/lib/visual-fixtures/environment";
import { OwnerVaultVisualFixture } from "./owner-vault-visual-fixture";

export const dynamic = "force-dynamic";

export default async function OwnerVaultVisualFixturePage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  if (!tryResolveVisualFixtureEnvironment(process.env)) notFound();
  const requestedLocale = (await searchParams).locale;
  const locale: InterfaceLocale =
    requestedLocale === "bg" || requestedLocale === "ru"
      ? requestedLocale
      : "uk";
  return <OwnerVaultVisualFixture locale={locale} />;
}
