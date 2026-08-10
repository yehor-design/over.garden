import { notFound } from "next/navigation";

import type { InterfaceLocale } from "@/lib/interface-localization";
import { tryResolveVisualFixtureEnvironment } from "@/lib/visual-fixtures/environment";
import { AccountSignOutVisualFixture } from "./account-sign-out-visual-fixture";

export const dynamic = "force-dynamic";

export default async function AccountSignOutVisualFixturePage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<{ locale?: string }>;
}) {
  if (!tryResolveVisualFixtureEnvironment(process.env)) notFound();
  const requestedLocale = (await searchParams).locale;
  const locale: InterfaceLocale =
    requestedLocale === "bg" || requestedLocale === "ru"
      ? requestedLocale
      : "uk";
  return <AccountSignOutVisualFixture locale={locale} />;
}
