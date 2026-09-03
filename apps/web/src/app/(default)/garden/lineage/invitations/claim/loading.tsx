import { WorkspaceSectionSkeleton } from "@/components/garden/workspace-state";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

import { LineageInvitationClaimShell } from "./invitation-shell";

export default async function LineageInvitationClaimLoading() {
  const locale = await getRequestInterfaceLocale();
  return (
    <LineageInvitationClaimShell locale={locale} state="loading">
      <WorkspaceSectionSkeleton locale={locale} rows={1} />
    </LineageInvitationClaimShell>
  );
}
