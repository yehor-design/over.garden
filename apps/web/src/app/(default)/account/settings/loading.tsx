import { WorkspaceSectionSkeleton } from "@/components/garden/workspace-state";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

import { AccountShell } from "../account-shell";

export default async function AccountSettingsLoading() {
  const locale = await getRequestInterfaceLocale();
  return (
    <AccountShell locale={locale} section="settings" state="loading">
      <WorkspaceSectionSkeleton locale={locale} rows={2} media={false} />
    </AccountShell>
  );
}
