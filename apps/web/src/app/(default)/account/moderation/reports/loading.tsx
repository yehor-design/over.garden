import { WorkspaceSectionSkeleton } from "@/components/garden/workspace-state";
import {
  ModerationAreas,
  ModerationFrame,
} from "@/components/moderation/moderation-frame";
import { getReportCopy } from "@/lib/moderation/report-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

/** The frame the reports arrive into. */
export default async function ContentReportsLoading() {
  const locale = await getRequestInterfaceLocale();
  const copy = getReportCopy(locale);
  return (
    <ModerationFrame
      locale={locale}
      surface="content-reports"
      state="loading"
      accessState="allowed"
      title={copy.owner.title}
      description={copy.owner.description}
      tabs={<ModerationAreas locale={locale} current="reports" />}
    >
      <WorkspaceSectionSkeleton locale={locale} rows={3} media={false} />
    </ModerationFrame>
  );
}
