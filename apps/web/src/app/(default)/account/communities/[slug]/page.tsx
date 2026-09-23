import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import {
  WorkspaceSectionError,
  workspaceSchemaMissingHint,
} from "@/components/garden/workspace-state";
import {
  ModerationOutcome,
  ModerationViews,
  readModerationOutcome,
  readModerationView,
} from "@/components/moderation/moderation-frame";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { getModerationCopy } from "@/lib/moderation-copy";
import {
  communityMutationRefusal,
  listCommunityModerationQueue,
  readCommunityModerationReport,
} from "@/server/community-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";

import {
  CommunityModerationFrame,
  CommunityReportCard,
  communityModerationPath,
  communityModerationViewHref,
  describeReportState,
} from "./moderation-parts";

interface CommunityModerationPageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const EMPTY_SEARCH_PARAMS: Record<string, string | string[] | undefined> = {};
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;

export async function generateMetadata(): Promise<Metadata> {
  const copy = getModerationCopy(await getRequestInterfaceLocale());
  return {
    title: copy.communities.metadataTitle,
    robots: { index: false, follow: false },
  };
}

/**
 * One community's reports (`OVE-500`, criteria 7–11).
 *
 * The queue is a view — open or resolved — and each report is a card that
 * says what was reported, by whom, about what, and where it stands, with the
 * actions that change it. An action comes back to the same view, and its
 * outcome is read back from the record: in the report's own card while the
 * card is still in the view, above the list when the action moved it out.
 * Nothing else on the page moves: one failed action is one card's notice,
 * never a list that disappears.
 *
 * Access is the server's own rule, asked once: an active assignment to this
 * community, or the owner. A guest gets the sign-in prompt; anybody else gets
 * "no access" and not one byte of the queue.
 */
export default async function CommunityModerationPage({
  params,
  searchParams,
}: CommunityModerationPageProps) {
  const [{ slug }, query, locale, viewer] = await Promise.all([
    params,
    searchParams ?? Promise.resolve(EMPTY_SEARCH_PARAMS),
    getRequestInterfaceLocale(),
    resolveWorkspaceViewer(),
  ]);
  if (!SLUG_PATTERN.test(slug)) notFound();
  const copy = getModerationCopy(locale);
  const view = readModerationView(query.view);
  const outcome = readModerationOutcome(query);
  const path = communityModerationPath(slug);

  if (viewer.status === "unavailable") {
    return (
      <CommunityModerationFrame
        locale={locale}
        slug={slug}
        contentKey={null}
        current="reports"
        accessState="unavailable"
      >
        <WorkspaceSectionError
          locale={locale}
          failure={viewer.failure}
          title={copy.community.eyebrow}
          retryHref={path}
          technicalHint={workspaceSchemaMissingHint(locale, viewer.failure)}
        />
      </CommunityModerationFrame>
    );
  }
  if (viewer.status === "sign-in-required") {
    return (
      <CommunityModerationFrame
        locale={locale}
        slug={slug}
        contentKey={null}
        current="reports"
        accessState="sign-in-required"
      >
        <SignInPrompt
          locale={locale}
          next={communityModerationViewHref(slug, view)}
        />
      </CommunityModerationFrame>
    );
  }

  const settled = await settleSection(
    async () => {
      try {
        const [queue, answered] = await Promise.all([
          listCommunityModerationQueue(viewer.scope, slug, { view }),
          outcome?.reportId
            ? readCommunityModerationReport(
                viewer.scope,
                slug,
                outcome.reportId,
              )
            : Promise.resolve(null),
        ]);
        return { kind: "ready" as const, queue, answered };
      } catch (error) {
        const refusal = communityMutationRefusal(error);
        if (refusal === "moderation_denied") return { kind: "denied" as const };
        if (refusal === "community_unavailable") {
          return { kind: "missing" as const };
        }
        throw error;
      }
    },
    {
      deadlineMs: workspaceSectionDeadlineMs(4),
      surface: "community-moderation",
      section: "reports",
    },
  );

  if (settled.status === "error") {
    return (
      <CommunityModerationFrame
        locale={locale}
        slug={slug}
        contentKey={null}
        current="reports"
        accessState="unavailable"
      >
        <WorkspaceSectionError
          locale={locale}
          failure={settled}
          title={copy.unavailable}
          retryHref={communityModerationViewHref(slug, view)}
          technicalHint={workspaceSchemaMissingHint(locale, settled)}
        />
      </CommunityModerationFrame>
    );
  }
  if (settled.value.kind === "missing") notFound();
  if (settled.value.kind === "denied") {
    return (
      <CommunityModerationFrame
        locale={locale}
        slug={slug}
        contentKey={null}
        current="reports"
        accessState="denied"
      >
        <Callout tone="warning" role="alert">
          <p>{copy.accessDenied}</p>
        </Callout>
      </CommunityModerationFrame>
    );
  }

  const { queue, answered } = settled.value;
  const inView = Boolean(
    outcome?.reportId &&
    queue.items.some((item) => item.reportId === outcome.reportId),
  );
  const now = answered ? describeReportState(locale, copy, answered) : null;

  return (
    <CommunityModerationFrame
      locale={locale}
      slug={slug}
      contentKey={queue.community.contentKey}
      current="reports"
      accessState="allowed"
    >
      <section
        id="moderation-queue"
        aria-labelledby="moderation-queue-title"
        data-private-moderation-queue="true"
        className="grid gap-4"
      >
        <h2 id="moderation-queue-title" className="sr-only">
          {copy.community.tabs.reports}
        </h2>
        <ModerationViews
          locale={locale}
          current={view}
          counts={queue.counts}
          hrefFor={(next) => communityModerationViewHref(slug, next)}
        />

        {/* An outcome whose report left this view — resolved out of "open",
            refused, or never found — is said above the list, so the owner is
            told even though the card has gone. */}
        {outcome && !inView ? (
          <div id="moderation-outcome" className="scroll-mt-20">
            <ModerationOutcome
              locale={locale}
              result={outcome.result}
              about={`${outcome.reportId ?? "none"}:${now ?? ""}`}
              now={
                answered && answered.journalTitle
                  ? `«${answered.journalTitle}» — ${now}`
                  : now
              }
            />
          </div>
        ) : null}

        {queue.items.length === 0 ? (
          <EmptyState
            title={
              view === "open"
                ? copy.community.emptyOpen
                : copy.community.emptyResolved
            }
          />
        ) : (
          <ul className="grid list-none gap-3">
            {queue.items.map((item) => (
              <CommunityReportCard
                key={item.reportId}
                locale={locale}
                slug={slug}
                view={view}
                item={item}
                outcome={
                  outcome && inView && outcome.reportId === item.reportId
                    ? { result: outcome.result, now }
                    : null
                }
              />
            ))}
          </ul>
        )}
      </section>
    </CommunityModerationFrame>
  );
}
