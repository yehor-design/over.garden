import type { Metadata } from "next";
import { Suspense } from "react";

import {
  WorkspaceMissingRecord,
  WorkspaceSectionError,
  WorkspaceSectionSkeleton,
} from "@/components/garden/workspace-state";
import {
  LivingObjectPassportContextRail,
  LivingObjectPassportOverview,
  OwnerLivingObjectPassportTimeline,
} from "@/components/living-object-passport/living-object-passport";
import { AuthIntentFocus } from "@/components/auth/auth-intent-focus";
import type { EntryScope, LocationVisibility, VarietyState } from "@/db/schema";
import {
  getInterfaceCopy,
  type InterfaceLocale,
} from "@/lib/interface-localization";
import { getGardenWorkspaceCopy } from "@/lib/garden-workspace-copy";
import {
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
} from "@/lib/auth/auth-intent-contract";
import { getOwnerObjectCopy } from "@/lib/owner-object-copy";
import { isObjectProgressMomentEligible } from "@/lib/garden/object-progress-moment";
import { normalizeSaveProgressMomentKind } from "@/lib/garden/save-progress-moment";
import { recordAnalyticsEventSafely } from "@/server/analytics-events";
import { resolveFollowUpValuePulsePrompt } from "@/server/follow-up-value-pulse";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import type { PlantObjectPage } from "@/server/journal-repository";
import { buildOwnerObjectPassportPresentation } from "@/server/owner-object-passport-presentation";
import type { RequestScope } from "@/server/request-scope";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";
import { gardenObjectPath, ObjectShell } from "./object-shell";
import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { EntryComposer } from "@/components/garden/entry-composer";
import { FollowUpValuePulse } from "./follow-up-value-pulse";
import { ObjectLegacyAnchors } from "./object-legacy-anchors";
import { ObjectProgressMoment } from "./object-progress-moment";
import {
  hasActivePublicEntry,
  loadOwnedObject,
  loadOwnerAuthorHandle,
  ObjectSectionsNav,
  ownPassportPath,
} from "./object-sections";
import { SaveProgressMoment } from "../../save-progress-moment";
import { loadObjectHistoryPortion } from "./object-history-portion-actions";
import { objectHistoryHref, requestedHistoryPage } from "./object-history-href";
import { OwnerEntryActions } from "./owner-entry-actions";
import type { PassportTimelinePortion } from "@/components/living-object-passport/living-object-passport";
import type { LivingObjectPassportTimelineEntry } from "@/lib/living-object-passport";
import { LIST_PORTION_SIZE, getShowMoreCopy } from "@/lib/show-more";

interface PlantObjectPageProps {
  params: Promise<{ objectId: string }>;
  searchParams: Promise<{
    valuePulse?: string;
    entryId?: string;
    saveProgress?: string | string[];
    authIntent?: string | string[];
    authControl?: string | string[];
    /** The timeline's portion (`OVE-518`). */
    page?: string | string[];
  }>;
}

/**
 * The page's own title, beside "Налаштування об'єкта" and "Походження
 * об'єкта": it inherited the garden's "Простір саду", which names no page, and
 * a screen reader announced that after every publish (WCAG 2.4.2, `OVE-478`).
 * Not the object's name: that is a read, and a title that waits for a read is
 * a page that cannot start (ADR-0023).
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestInterfaceLocale();
  return {
    title: `${getOwnerObjectCopy(locale).historyPage.title} | OverGarden`,
    robots: { index: false, follow: false },
  };
}

export default async function PlantObjectReadbackPage({
  params,
  searchParams,
}: PlantObjectPageProps) {
  const [{ objectId }, query, viewer, locale] = await Promise.all([
    params,
    searchParams,
    resolveWorkspaceViewer(),
    getRequestInterfaceLocale(),
  ]);
  const copy = getInterfaceCopy(locale);
  const resumeAction = normalizeAuthIntentResumeAction(query.authIntent);
  const resumeControl = normalizeAuthIntentResumeControl(query.authControl);

  if (viewer.status === "unavailable") {
    return (
      <ObjectShell locale={locale}>
        <WorkspaceSectionError
          locale={locale}
          failure={viewer.failure}
          retryHref={gardenObjectPath(objectId)}
        />
      </ObjectShell>
    );
  }

  if (viewer.status === "sign-in-required") {
    return (
      <ObjectShell locale={locale}>
        <SignInPrompt locale={locale} next={`/garden/objects/${objectId}`} />
      </ObjectShell>
    );
  }

  return (
    <ObjectShell locale={locale}>
      <AuthIntentFocus action={resumeAction} control={resumeControl} />
      <Suspense
        fallback={
          <WorkspaceSectionSkeleton
            locale={locale}
            title={copy.object.livingObject}
            rows={3}
          />
        }
      >
        <PlantObjectSections
          locale={locale}
          objectId={objectId}
          query={query}
          scope={viewer.scope}
        />
      </Suspense>
    </ObjectShell>
  );
}

/**
 * The whole passport, settled. The object read and the provenance read are
 * bounded together because the presentation needs both; a missing record is a
 * rendered state rather than `notFound()`, for the reason `WorkspaceMissingRecord`
 * records.
 */
async function PlantObjectSections({
  locale,
  objectId,
  query,
  scope,
}: {
  locale: InterfaceLocale;
  objectId: string;
  query: Awaited<PlantObjectPageProps["searchParams"]>;
  scope: RequestScope;
}) {
  const copy = getInterfaceCopy(locale);
  const workspaceCopy = getGardenWorkspaceCopy(locale);
  const ownerCopy = getOwnerObjectCopy(locale);

  const settled = await loadOwnedObject(scope, objectId);

  if (settled.status === "error") {
    return (
      <WorkspaceSectionError
        locale={locale}
        failure={settled}
        title={copy.object.livingObject}
        retryHref={gardenObjectPath(objectId)}
      />
    );
  }
  if (!settled.value) return <WorkspaceMissingRecord locale={locale} />;

  const { page, provenancePanel } = settled.value;
  const showProgressMoment = isObjectProgressMomentEligible(
    page.entries.length,
  );
  // Analytics is a side effect of rendering this passport, never a reason not
  // to render it: bounded here so a slow or unhappy recorder cannot become the
  // reason a gardener stares at a skeleton.
  await settleSection(
    async () => {
      await recordOwnRecordRevisited(scope, page);
      if (showProgressMoment) await recordProgressMomentShown(scope, page);
    },
    {
      deadlineMs: workspaceSectionDeadlineMs(2),
      surface: "object",
      section: "analytics",
      record: false,
    },
  );

  const today = new Date().toISOString().slice(0, 10);
  const saveProgressKind = normalizeSaveProgressMomentKind(query.saveProgress);
  // The owner's registry handle: every public link on this page hangs from
  // it (ADR-0029 D9), settled like every other read on a workspace render
  // path (ADR-0023) — one rejection here once turned a loaded passport into a
  // boundary that never resolved on a hard load.
  const authorHandle = await loadOwnerAuthorHandle(scope);
  const passportPath = ownPassportPath(page, objectId, authorHandle, locale);
  const valuePulseJournalEntryId =
    query.valuePulse === "1" && typeof query.entryId === "string"
      ? query.entryId.trim()
      : "";
  // A value pulse is an optional prompt on top of a page that already renders,
  // so its failure is its absence — bounded and classified all the same.
  const valuePulseSection =
    valuePulseJournalEntryId.length > 0
      ? await settleSection(
          () =>
            resolveFollowUpValuePulsePrompt(scope, {
              plantObjectId: objectId,
              journalEntryId: valuePulseJournalEntryId,
            }),
          {
            deadlineMs: workspaceSectionDeadlineMs(2),
            surface: "object",
            section: "value-pulse",
            record: false,
          },
        )
      : null;
  const valuePulsePrompt =
    valuePulseSection?.status === "ready"
      ? valuePulseSection.value
      : { eligible: false };
  const presentation = buildOwnerObjectPassportPresentation(
    page,
    provenancePanel,
    locale,
    authorHandle,
    hasActivePublicEntry(page) ? passportPath : null,
  );
  const entriesById = new Map(page.entries.map((entry) => [entry.id, entry]));

  return (
    <>
      <LivingObjectPassportContextRail
        passport={presentation}
        locale={locale}
      />
      {/* The shell's "Живий об'єкт" is the page's one h1; the name is h2. */}
      <LivingObjectPassportOverview
        passport={presentation}
        locale={locale}
        headingLevel={2}
      />
      <ObjectSectionsNav
        locale={locale}
        objectId={objectId}
        current="history"
        provenanceCount={provenancePanel.edges.length}
      />
      <ObjectLegacyAnchors objectId={objectId} />

      {saveProgressKind === "first-entry" ||
      saveProgressKind === "follow-up" ? (
        <SaveProgressMoment
          locale={locale}
          kind={saveProgressKind}
          entryCount={page.entries.length}
          objectName={page.plantObject.display_name}
          entryTitle={page.entries[0]?.title ?? null}
          primaryHref="#follow-up-composer"
          primaryLabel={workspaceCopy.saveProgress.actions.addAnotherEntry}
          secondaryHref="/garden"
          secondaryLabel={copy.object.backToJournal}
        />
      ) : null}

      {valuePulsePrompt.eligible ? (
        <FollowUpValuePulse
          locale={locale}
          objectId={objectId}
          journalEntryId={valuePulseJournalEntryId}
        />
      ) : null}

      <section
        id="follow-up-composer"
        className="grid gap-4 border-t border-border pt-5"
      >
        <div className="flex flex-col gap-1">
          <h2 className="text-h3 text-text-heading">
            {ownerCopy.followUpSection.title}
          </h2>
          <p className="text-body-sm text-text-muted">
            {ownerCopy.followUpSection.description}
          </p>
        </div>

        {/* The one entry composer, with this object named (OVE-486). */}
        <EntryComposer
          locale={locale}
          initialDestination={{
            kind: "object",
            id: objectId,
            displayName: page.plantObject.display_name,
            objectKind: page.plantObject.object_kind,
            parent: { id: page.space.id, displayName: page.space.display_name },
            species: page.plantObject.catalog_canonical_name ?? null,
          }}
          today={today}
          closeHref={`/garden/objects/${encodeURIComponent(objectId)}`}
        />
      </section>

      {/* A summary of the story so far — its span and, when there are two,
          its first and latest photographs — just above the story itself,
          never a second copy of it above Write (`OVE-491`). */}
      {showProgressMoment ? (
        <ObjectProgressMoment
          locale={locale}
          objectName={page.plantObject.display_name}
          entries={page.entries.map((entry) => ({
            id: entry.id,
            title: entry.title,
            body: entry.body,
            entryDate: entry.entry_date,
            mediaPublicUrl: entry.media?.publicUrl ?? null,
            mediaFocalX: entry.media?.focalX ?? null,
            mediaFocalY: entry.media?.focalY ?? null,
            mediaIntrinsicWidth: entry.media?.intrinsicWidth ?? null,
            mediaIntrinsicHeight: entry.media?.intrinsicHeight ?? null,
          }))}
        />
      ) : null}

      <OwnerLivingObjectPassportTimeline
        passport={presentation}
        locale={locale}
        portion={objectHistoryPortion({
          objectId,
          locale,
          entries: presentation.timeline.entries,
          page: requestedHistoryPage(query.page),
        })}
        renderEntryActions={(timelineEntry) => {
          const entry = entriesById.get(timelineEntry.id);
          return entry ? (
            <OwnerEntryActions
              entry={entry}
              objectId={objectId}
              locale={locale}
              authorHandle={authorHandle}
            />
          ) : null;
        }}
      />
    </>
  );
}

/**
 * The portion of the owner's timeline this address shows (DESIGN.md §5.26):
 * twenty entries, the year the previous portion ended on, and the link to the
 * next. The summaries above the timeline still read the whole story.
 */
function objectHistoryPortion({
  objectId,
  locale,
  entries,
  page,
}: {
  objectId: string;
  locale: InterfaceLocale;
  entries: LivingObjectPassportTimelineEntry[];
  page: number;
}): PassportTimelinePortion {
  const pages = Math.max(1, Math.ceil(entries.length / LIST_PORTION_SIZE));
  const current = Math.min(page, pages);
  const start = (current - 1) * LIST_PORTION_SIZE;
  return {
    entries: entries.slice(start, start + LIST_PORTION_SIZE),
    precedingYear: start > 0 ? entries[start - 1]?.year : undefined,
    first: current === 1,
    next:
      current < pages
        ? {
            token: String(current + 1),
            href: objectHistoryHref(objectId, current + 1),
          }
        : null,
    load: loadObjectHistoryPortion.bind(null, { locale, objectId }),
    copy: getShowMoreCopy(locale),
  };
}

async function recordOwnRecordRevisited(
  scope: RequestScope,
  page: PlantObjectPage,
) {
  const latestEntry = page.entries[0];
  if (!latestEntry) return;

  await recordAnalyticsEventSafely(scope, {
    eventName: "own_record_revisited",
    properties: {
      followed_by_action: false,
      location_visibility_level: page.plantObject
        .location_visibility as LocationVisibility,
      variety_state: page.plantObject.variety_state as VarietyState,
    },
    spaceId: page.space.id,
    plantObjectId: page.plantObject.id,
    journalEntryId: latestEntry.id,
  });
}

async function recordProgressMomentShown(
  scope: RequestScope,
  page: PlantObjectPage,
) {
  const latestEntry = page.entries[0];
  if (!latestEntry) return;

  await recordAnalyticsEventSafely(scope, {
    eventName: "progress_screen_shown",
    properties: {
      entry_scope: latestEntry.entry_scope as EntryScope,
      has_photo: page.entries.some((entry) => entry.media !== null),
      location_visibility_level: page.plantObject
        .location_visibility as LocationVisibility,
      variety_state: page.plantObject.variety_state as VarietyState,
    },
    spaceId: page.space.id,
    plantObjectId: page.plantObject.id,
    journalEntryId: latestEntry.id,
  });
}
