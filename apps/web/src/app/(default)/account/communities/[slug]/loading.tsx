import { WorkspaceSectionSkeleton } from "@/components/garden/workspace-state";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

import { CommunityModerationFrame } from "./moderation-parts";

/**
 * The frame a community's queue arrives into. The community's name is not
 * known before the read, so the skeleton says only what the page is.
 */
export default async function CommunityModerationLoading() {
  const locale = await getRequestInterfaceLocale();
  return (
    <CommunityModerationFrame
      locale={locale}
      slug="loading"
      contentKey={null}
      current="reports"
      state="loading"
      accessState="allowed"
    >
      <WorkspaceSectionSkeleton locale={locale} rows={3} media={false} />
    </CommunityModerationFrame>
  );
}
