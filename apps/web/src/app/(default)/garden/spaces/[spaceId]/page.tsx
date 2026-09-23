import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { GardenItemRow } from "@/components/garden/garden-collection";
import {
  WorkspaceMissingRecord,
  WorkspaceSectionError,
  WorkspaceSectionSkeleton,
} from "@/components/garden/workspace-state";
import { GearIcon } from "@/components/icons/Gear";
import { NotePencilIcon } from "@/components/icons/NotePencil";
import { PlusIcon } from "@/components/icons/Plus";
import { buttonVariants } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Section } from "@/components/ui/section";
import {
  formatLastEntry,
  gardenCollectionItemAnchor,
  GARDEN_COLLECTION_PAGE_SIZE,
} from "@/lib/garden/garden-collection";
import { getLocalizedCoarseRegionLabel } from "@/lib/garden/regions";
import { normalizeSaveProgressMomentKind } from "@/lib/garden/save-progress-moment";
import {
  gardenSpaceAddObjectHref,
  gardenSpacePath,
  gardenSpaceSettingsPath,
  gardenSpaceWriteHref,
  isSpaceId,
  normalizeSpacePageRequest,
  SPACE_HISTORY_PAGE_SIZE,
  SPACE_OBJECTS_PREVIEW_SIZE,
  SPACE_HISTORY_PREVIEW_SIZE,
  type OwnedSpaceSummary,
  type SpaceHistoryEntry,
  type SpaceHistoryPage,
  type SpacePageRequest,
} from "@/lib/garden/space-page";
import { formatGardenWorkspaceDate } from "@/lib/garden-workspace-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatSpacePageTemplate as template,
  getSpacePageCopy,
  type SpacePageCopy,
} from "@/lib/space-page-copy";
import type { GardenObjectsGroup } from "@/lib/garden/garden-collection";
import { getPublicAuthorHandle } from "@/server/author-handle-repository";
import { listGardenObjects } from "@/server/garden-collection-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import type { scopedToUser } from "@/server/request-scope";
import {
  listSpaceHistory,
  readSpacePageSummary,
} from "@/server/space-page-repository";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
  type WorkspaceSection,
} from "@/server/workspace-failure";

import { SaveProgressMoment } from "../../save-progress-moment";
import { SpaceShell } from "./space-shell";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestInterfaceLocale();
  return {
    title: `${getSpacePageCopy(locale).shell.title} | OverGarden`,
    robots: { index: false, follow: false },
  };
}

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * A space's own page (`OVE-490`): what lives here, what was written here, and
 * the three things a gardener does with a place — write about it, add a plant
 * or an animal to it, change its settings. Every read is settled on its own
 * (ADR-0023), so a failed history never hides the plants, and neither is ever
 * shown as empty because it failed.
 */
export default async function GardenSpacePage({
  params,
  searchParams,
}: {
  params: Promise<{ spaceId: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const [{ spaceId }, query, viewer, locale] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as SearchParams),
    resolveWorkspaceViewer(),
    getRequestInterfaceLocale(),
  ]);
  const request = normalizeSpacePageRequest(query);

  if (viewer.status === "unavailable") {
    return (
      <SpaceShell locale={locale}>
        <div>
          <WorkspaceSectionError
            locale={locale}
            failure={viewer.failure}
            retryHref={gardenSpacePath(spaceId)}
          />
        </div>
      </SpaceShell>
    );
  }
  if (viewer.status === "sign-in-required") {
    return (
      <SpaceShell locale={locale}>
        <div>
          <SignInPrompt locale={locale} next={gardenSpacePath(spaceId)} />
        </div>
      </SpaceShell>
    );
  }

  return (
    <SpaceShell locale={locale}>
      <Suspense
        fallback={
          <div>
            <WorkspaceSectionSkeleton
              locale={locale}
              title={getSpacePageCopy(locale).history.title}
              rows={3}
              media={false}
            />
          </div>
        }
      >
        <SpaceSections
          locale={locale}
          scope={viewer.scope}
          userId={viewer.userId}
          spaceId={spaceId}
          request={request}
          showSaveProgress={
            normalizeSaveProgressMomentKind(query.saveProgress) ===
            "space-entry"
          }
        />
      </Suspense>
    </SpaceShell>
  );
}

async function SpaceSections({
  locale,
  scope,
  userId,
  spaceId,
  request,
  showSaveProgress,
}: {
  locale: InterfaceLocale;
  scope: ReturnType<typeof scopedToUser>;
  userId: string;
  spaceId: string;
  request: SpacePageRequest;
  showSaveProgress: boolean;
}) {
  if (!isSpaceId(spaceId)) {
    return (
      <WorkspaceMissingRecord
        locale={locale}
        backHref="/garden#garden-spaces"
      />
    );
  }
  const copy = getSpacePageCopy(locale);
  const deadlineMs = workspaceSectionDeadlineMs(3);
  const [summary, handle] = await Promise.all([
    settleSection(() => readSpacePageSummary(scope, spaceId), {
      deadlineMs,
      surface: "space",
      section: "summary",
    }),
    settleSection(() => getPublicAuthorHandle(userId), {
      deadlineMs: workspaceSectionDeadlineMs(1),
      surface: "space",
      section: "author-handle",
      record: false,
    }),
  ]);
  if (summary.status === "error") {
    return (
      <div>
        <WorkspaceSectionError
          locale={locale}
          failure={summary}
          retryHref={gardenSpacePath(spaceId)}
        />
      </div>
    );
  }
  if (!summary.value) {
    return (
      <WorkspaceMissingRecord
        locale={locale}
        backHref="/garden#garden-spaces"
      />
    );
  }
  const space = summary.value;
  const authorHandle = handle.status === "ready" ? handle.value : null;
  const today = new Date().toISOString().slice(0, 10);

  const [objects, history] = await Promise.all([
    request.view === "history"
      ? null
      : settleSection(
          () =>
            listGardenObjects(
              scope,
              {
                q: "",
                sort: "recent",
                kind: "object",
                page: request.view === "objects" ? request.page : 1,
              },
              { spaceId: space.id },
            ),
          { deadlineMs, surface: "space", section: "objects" },
        ),
    request.view === "objects"
      ? null
      : settleSection(
          () => listSpaceHistory(scope, space.id, request, authorHandle),
          { deadlineMs, surface: "space", section: "history" },
        ),
  ]);

  return (
    <div className="flex flex-col gap-8">
      {showSaveProgress ? (
        <SaveProgressMoment
          locale={locale}
          kind="space-entry"
          entryCount={space.entryCount}
          spaceName={space.displayName}
          entryTitle={
            history?.status === "ready"
              ? (history.value.entries[0]?.title ?? null)
              : null
          }
          primaryHref="#space-history"
          primaryLabel={copy.history.title}
          secondaryHref={gardenSpaceAddObjectHref(space.id)}
          secondaryLabel={copy.actions.addObject}
        />
      ) : null}
      <SpaceOverview copy={copy} locale={locale} space={space} today={today} />
      {request.view !== "overview" ||
      space.objectCount > SPACE_OBJECTS_PREVIEW_SIZE ||
      space.entryCount > SPACE_HISTORY_PREVIEW_SIZE ? (
        <SpaceViews copy={copy} request={request} space={space} />
      ) : null}
      {objects ? (
        <SpaceObjects
          copy={copy}
          locale={locale}
          request={request}
          section={objects}
          space={space}
          today={today}
        />
      ) : null}
      {history ? (
        <SpaceHistory
          copy={copy}
          locale={locale}
          request={request}
          section={history}
          space={space}
        />
      ) : null}
    </div>
  );
}

function SpaceOverview({
  copy,
  locale,
  space,
  today,
}: {
  copy: SpacePageCopy;
  locale: InterfaceLocale;
  space: OwnedSpaceSummary;
  today: string;
}) {
  // A nought is omitted, not printed (DESIGN.md §5.10): an empty space says so
  // in its sections, in words.
  const facts = [
    space.objectCount > 0
      ? template(copy.overview.objects, { count: space.objectCount })
      : null,
    space.entryCount > 0
      ? template(copy.overview.entries, { count: space.entryCount })
      : null,
  ].filter((fact): fact is string => fact !== null);
  const [before, after] = copy.overview.lastEntry.split("{when}");
  const region =
    space.locationVisibility === "region" && space.coarseRegionCode
      ? getLocalizedCoarseRegionLabel(locale, space.coarseRegionCode)
      : null;

  return (
    <section
      aria-labelledby="space-overview-heading"
      data-space-overview={space.id}
      className="grid gap-3"
    >
      <h2
        id="space-overview-heading"
        className="text-h2 break-words text-text-heading"
      >
        {space.displayName}
      </h2>
      <p className="text-body-sm text-text-muted">
        {facts.length > 0 ? `${facts.join(" · ")} · ` : null}
        <span data-space-last-entry={space.lastEntryDate ?? "never"}>
          {space.lastEntryDate ? (
            <>
              {before}
              <time dateTime={space.lastEntryDate}>
                {formatLastEntry(space.lastEntryDate, today, locale)}
              </time>
              {after}
            </>
          ) : (
            copy.overview.never
          )}
        </span>
      </p>
      <p className="text-caption text-text-muted">
        {region
          ? template(copy.overview.locationRegion, { region })
          : copy.overview.locationHidden}
      </p>
      <nav
        aria-label={copy.actions.label}
        data-space-actions="true"
        className="flex flex-wrap items-center gap-2"
      >
        <Link
          href={gardenSpaceWriteHref(space.id)}
          data-space-action="write"
          aria-label={template(copy.actions.writeLabel, {
            name: space.displayName,
          })}
          className={buttonVariants()}
        >
          <NotePencilIcon aria-hidden="true" />
          {copy.actions.write}
        </Link>
        <Link
          href={gardenSpaceAddObjectHref(space.id)}
          data-space-action="add-object"
          className={buttonVariants({ variant: "secondary" })}
        >
          <PlusIcon aria-hidden="true" />
          {copy.actions.addObject}
        </Link>
        <Link
          href={gardenSpaceSettingsPath(space.id)}
          data-space-action="settings"
          className={buttonVariants({ variant: "secondary" })}
        >
          <GearIcon aria-hidden="true" />
          {copy.actions.settings}
        </Link>
      </nav>
    </section>
  );
}

/** The page's views, as links, when there is more than fits on one screen. */
function SpaceViews({
  copy,
  request,
  space,
}: {
  copy: SpacePageCopy;
  request: SpacePageRequest;
  space: OwnedSpaceSummary;
}) {
  const views = [
    { view: "overview" as const, label: copy.views.overview, count: null },
    {
      view: "objects" as const,
      label: copy.views.objects,
      count: space.objectCount || null,
    },
    {
      view: "history" as const,
      label: copy.views.history,
      count: space.entryCount || null,
    },
  ];
  return (
    <nav aria-label={copy.views.label} data-space-views="true">
      <ul className="flex list-none flex-wrap gap-2">
        {views.map(({ view, label, count }) => {
          const current = request.view === view;
          return (
            <li key={view}>
              <Link
                href={gardenSpacePath(space.id, { view })}
                aria-current={current ? "page" : undefined}
                data-space-view={view}
                className={
                  current
                    ? "inline-flex min-h-11 items-center rounded-full border border-action bg-action-subtle px-4 text-body-sm font-medium text-action-subtle-text outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    : "inline-flex min-h-11 items-center rounded-full border border-border-control px-4 text-body-sm font-medium text-text outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                }
              >
                {label}
                {count ? (
                  <span className="ml-2 text-caption text-text-muted tabular-nums">
                    {count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SpaceObjects({
  copy,
  locale,
  request,
  section,
  space,
  today,
}: {
  copy: SpacePageCopy;
  locale: InterfaceLocale;
  request: SpacePageRequest;
  section: WorkspaceSection<GardenObjectsGroup>;
  space: OwnedSpaceSummary;
  today: string;
}) {
  if (section.status === "error") {
    return (
      <WorkspaceSectionError
        id="space-objects"
        locale={locale}
        title={copy.objects.error}
        failure={section}
        retryHref={gardenSpacePath(space.id, request, "space-objects")}
      />
    );
  }
  const group = section.value;
  const preview = request.view === "overview";
  const items = preview
    ? group.items.slice(0, SPACE_OBJECTS_PREVIEW_SIZE)
    : group.items;
  const pages = Math.max(
    1,
    Math.ceil(group.total / GARDEN_COLLECTION_PAGE_SIZE),
  );
  const page = Math.min(request.page, pages);

  return (
    <Section
      id="space-objects"
      title={
        <>
          {copy.objects.title}
          {group.total > 0 ? (
            <span className="ml-2 align-middle text-body-sm font-normal text-text-muted tabular-nums">
              {group.total}
            </span>
          ) : null}
        </>
      }
      className="scroll-mt-20"
      data-space-section="objects"
      actions={
        preview && group.total > SPACE_OBJECTS_PREVIEW_SIZE ? (
          <Link
            href={gardenSpacePath(space.id, { view: "objects" })}
            data-space-all="objects"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            {template(copy.objects.all, { count: group.total })}
          </Link>
        ) : null
      }
    >
      {items.length > 0 ? (
        <ul className="grid" data-space-objects-list="true">
          {items.map((item) => (
            <GardenItemRow
              key={item.id}
              item={item}
              locale={locale}
              today={today}
              showSpace={false}
              writeHref={`/garden/new?${new URLSearchParams({
                object: item.id,
                returnTo: gardenSpacePath(
                  space.id,
                  request,
                  gardenCollectionItemAnchor(item),
                ),
              }).toString()}`}
            />
          ))}
        </ul>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-body-sm text-text-muted">{copy.objects.empty}</p>
          <Link
            href={gardenSpaceAddObjectHref(space.id)}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            <PlusIcon aria-hidden="true" />
            {copy.actions.addObject}
          </Link>
        </div>
      )}
      {!preview && pages > 1 ? (
        <Pagination
          label={copy.pagination.label}
          data-space-pagination="objects"
          previousHref={
            page > 1
              ? gardenSpacePath(
                  space.id,
                  { view: "objects", page: page - 1 },
                  "space-objects",
                )
              : null
          }
          previousLabel={copy.pagination.previous}
          nextHref={
            page < pages
              ? gardenSpacePath(
                  space.id,
                  { view: "objects", page: page + 1 },
                  "space-objects",
                )
              : null
          }
          nextLabel={copy.pagination.next}
          status={template(copy.pagination.page, { page, pages })}
        />
      ) : null}
    </Section>
  );
}

function SpaceHistory({
  copy,
  locale,
  request,
  section,
  space,
}: {
  copy: SpacePageCopy;
  locale: InterfaceLocale;
  request: SpacePageRequest;
  section: WorkspaceSection<SpaceHistoryPage>;
  space: OwnedSpaceSummary;
}) {
  if (section.status === "error") {
    return (
      <WorkspaceSectionError
        id="space-history"
        locale={locale}
        title={copy.history.error}
        failure={section}
        retryHref={gardenSpacePath(space.id, request, "space-history")}
      />
    );
  }
  const history = section.value;
  const preview = request.view === "overview";
  const pages = Math.max(1, Math.ceil(history.total / SPACE_HISTORY_PAGE_SIZE));
  const page = Math.min(request.page, pages);

  return (
    <Section
      id="space-history"
      title={
        <>
          {copy.history.title}
          {history.total > 0 ? (
            <span className="ml-2 align-middle text-body-sm font-normal text-text-muted tabular-nums">
              {history.total}
            </span>
          ) : null}
        </>
      }
      description={copy.history.description}
      className="scroll-mt-20"
      data-space-section="history"
      actions={
        preview && history.total > SPACE_HISTORY_PREVIEW_SIZE ? (
          <Link
            href={gardenSpacePath(space.id, { view: "history" })}
            data-space-all="history"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            {template(copy.history.all, { count: history.total })}
          </Link>
        ) : null
      }
    >
      {/* The address this history had on the garden page, so an old link
          with its fragment still lands here (`/garden?space=…#space-journal`
          answers 308 to this page and the browser keeps the fragment). */}
      <span id="space-journal" aria-hidden="true" />
      {history.entries.length > 0 ? (
        <ol
          className="divide-y divide-border border-y border-border"
          data-space-history-list="true"
        >
          {history.entries.map((entry) => (
            <SpaceHistoryRow
              key={entry.id}
              copy={copy}
              entry={entry}
              locale={locale}
              returnTo={gardenSpacePath(
                space.id,
                request,
                `space-entry-${entry.id}`,
              )}
            />
          ))}
        </ol>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-body-sm text-text-muted">{copy.history.empty}</p>
          <Link
            href={gardenSpaceWriteHref(space.id)}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            <NotePencilIcon aria-hidden="true" />
            {copy.actions.write}
          </Link>
        </div>
      )}
      {!preview && pages > 1 ? (
        <Pagination
          label={copy.pagination.label}
          data-space-pagination="history"
          previousHref={
            page > 1
              ? gardenSpacePath(
                  space.id,
                  { view: "history", page: page - 1 },
                  "space-history",
                )
              : null
          }
          previousLabel={copy.pagination.previous}
          nextHref={
            page < pages
              ? gardenSpacePath(
                  space.id,
                  { view: "history", page: page + 1 },
                  "space-history",
                )
              : null
          }
          nextLabel={copy.pagination.next}
          status={template(copy.pagination.page, { page, pages })}
        />
      ) : null}
    </Section>
  );
}

/**
 * One entry, once, under its one address, and labelled with what it is about:
 * the space itself, or the plant or animal it was written for (criterion 2).
 */
function SpaceHistoryRow({
  copy,
  entry,
  locale,
  returnTo,
}: {
  copy: SpacePageCopy;
  entry: SpaceHistoryEntry;
  locale: InterfaceLocale;
  returnTo: string;
}) {
  const editHref = `/garden/entries/${encodeURIComponent(entry.id)}/edit?${new URLSearchParams(
    { returnTo },
  ).toString()}`;
  return (
    <li
      id={`space-entry-${entry.id}`}
      data-space-history-entry={entry.id}
      data-space-history-about={entry.about.kind}
      className="flex min-w-0 scroll-mt-24 flex-wrap items-start justify-between gap-x-4 gap-y-2 py-4"
    >
      <div className="grid min-w-0 flex-1 basis-60 gap-1">
        <p className="text-h4 break-words text-text-heading">
          {entry.publicPath ? (
            <Link
              href={entry.publicPath}
              className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              {entry.title}
            </Link>
          ) : (
            entry.title
          )}
        </p>
        <p className="text-caption text-text-muted">
          {entry.about.kind === "space" ? (
            copy.history.aboutSpace
          ) : (
            <Link
              href={`/garden/objects/${encodeURIComponent(entry.about.objectId)}`}
              className="underline-offset-4 hover:underline"
            >
              {template(copy.history.aboutObject, {
                name: entry.about.displayName,
              })}
            </Link>
          )}
          {" · "}
          <time dateTime={entry.entryDate}>
            {formatGardenWorkspaceDate(locale, entry.entryDate)}
          </time>
          {entry.publicPath ? null : ` · ${copy.history.notPublic}`}
        </p>
      </div>
      <Link
        href={editHref}
        aria-label={template(copy.history.editLabel, { title: entry.title })}
        data-space-history-edit={entry.id}
        className={buttonVariants({ variant: "secondary", size: "sm" })}
      >
        {copy.history.edit}
      </Link>
    </li>
  );
}
