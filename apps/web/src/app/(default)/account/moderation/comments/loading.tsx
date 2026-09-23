import { WorkspaceSectionSkeleton } from "@/components/garden/workspace-state";
import {
  ModerationAreas,
  ModerationFrame,
} from "@/components/moderation/moderation-frame";
import { getModerationCopy } from "@/lib/moderation-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

/** The frame the comment reports arrive into. */
export default async function CommentModerationLoading() {
  const locale = await getRequestInterfaceLocale();
  const copy = getModerationCopy(locale);
  return (
    <ModerationFrame
      locale={locale}
      surface="comment-moderation"
      state="loading"
      accessState="allowed"
      title={copy.comments.title}
      description={copy.comments.description}
      tabs={<ModerationAreas locale={locale} current="comments" />}
    >
      <WorkspaceSectionSkeleton locale={locale} rows={3} media={false} />
    </ModerationFrame>
  );
}
