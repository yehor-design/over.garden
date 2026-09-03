import { WorkspaceSectionSkeleton } from "@/components/garden/workspace-state";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

import { ProfileShell } from "./profile-shell";

export default async function GardenProfileLoading() {
  const locale = await getRequestInterfaceLocale();
  return (
    <ProfileShell locale={locale} state="loading">
      <WorkspaceSectionSkeleton locale={locale} rows={3} />
    </ProfileShell>
  );
}
