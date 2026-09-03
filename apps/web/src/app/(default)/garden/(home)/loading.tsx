import { getRequestInterfaceLocale } from "@/server/interface-localization";

import {
  GardenHomeSectionsSkeleton,
  GardenHomeShell,
} from "./garden-home-shell";

export default async function GardenHomeLoading() {
  const locale = await getRequestInterfaceLocale();
  return (
    <GardenHomeShell locale={locale} state="loading">
      <GardenHomeSectionsSkeleton locale={locale} />
    </GardenHomeShell>
  );
}
