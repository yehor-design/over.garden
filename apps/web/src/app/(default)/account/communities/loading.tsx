import { WorkspaceSectionSkeleton } from "@/components/garden/workspace-state";
import {
  ModerationAreas,
  ModerationFrame,
} from "@/components/moderation/moderation-frame";
import { getModerationCopy } from "@/lib/moderation-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

/** The frame the list arrives into, while the communities are read. */
export default async function CommunityModerationDirectoryLoading() {
  const locale = await getRequestInterfaceLocale();
  const copy = getModerationCopy(locale);
  return (
    <ModerationFrame
      locale={locale}
      surface="communities-moderation"
      state="loading"
      accessState="allowed"
      title={copy.communities.title}
      description={copy.communities.description}
      tabs={<ModerationAreas locale={locale} current="communities" />}
    >
      <WorkspaceSectionSkeleton locale={locale} rows={2} media={false} />
    </ModerationFrame>
  );
}
