import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Bug,
  Camera,
  CirclePlus,
  ImageOff,
  Leaf,
  PawPrint,
  RefreshCw,
  Sprout,
  SquarePen,
} from "lucide-react";

import { SubjectAwareMediaImage } from "@/components/media/subject-aware-media-image";
import { buttonVariants } from "@/components/ui/button";
import {
  formatGardenCount,
  formatGardenWorkspaceDate,
  formatGardenWorkspaceTemplate,
  getGardenWorkspaceCopy,
  type GardenWorkspaceCopy,
} from "@/lib/garden-workspace-copy";
import {
  getInterfaceCopy,
  type InterfaceLocale,
} from "@/lib/interface-localization";
import { cn } from "@/lib/utils";
import type {
  GardenWorkspaceReadModel,
  GardenWorkspaceRecentEntry,
  GardenWorkspaceSpaceSummary,
} from "@/server/garden-workspace-repository";
import type { PlantObjectSummary } from "@/server/journal-repository";
import {
  GardenWorkspaceLocalState,
  type GardenWorkspaceLocalStateSnapshot,
} from "./garden-workspace-local-state";

interface GardenWorkspaceViewProps {
  ownerUserId: string;
  canWrite: boolean;
  locale: InterfaceLocale;
  today: string;
  workspace: GardenWorkspaceReadModel;
  localState?: GardenWorkspaceLocalStateSnapshot;
  children?: ReactNode;
}

export function GardenWorkspaceView({
  ownerUserId,
  canWrite,
  locale,
  today,
  workspace,
  localState,
  children,
}: GardenWorkspaceViewProps) {
  const copy = getInterfaceCopy(locale);
  const workspaceCopy = getGardenWorkspaceCopy(locale);

  if (workspace.allFailed) {
    return (
      <main
        lang={locale}
        data-garden-workspace="error"
        className="mx-auto flex w-full max-w-4xl flex-col px-4 py-6 sm:px-6 sm:py-8"
      >
        <WorkspaceHeader
          eyebrow={workspaceCopy.workspace.headerEyebrow}
          title={copy.workspace.title}
          description={copy.workspace.returningDescription}
        />
        <section className="mt-8 border-y border-border py-8">
          <AlertTriangle
            className="size-6 text-destructive"
            aria-hidden="true"
          />
          <h2 className="mt-3 text-xl font-semibold text-foreground">
            {workspaceCopy.workspace.error.title}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            {workspaceCopy.workspace.error.description}
          </p>
          <Link
            href="/garden"
            className={buttonVariants({ className: "mt-4" })}
          >
            <RefreshCw aria-hidden="true" />
            {workspaceCopy.workspace.error.retry}
          </Link>
        </section>
        <GardenWorkspaceLocalState
          ownerUserId={ownerUserId}
          locale={locale}
          nextAction={{
            href: "/garden",
            label: workspaceCopy.workspace.error.retryAction,
          }}
          recent={[]}
          inbox={null}
          media={null}
          initialState={localState}
        />
      </main>
    );
  }

  const inventory =
    workspace.inventory.status === "ready" ? workspace.inventory.value : null;
  const recent =
    workspace.recent.status === "ready" ? workspace.recent.value : [];
  const inbox =
    workspace.inbox.status === "ready" ? workspace.inbox.value : null;
  const media =
    workspace.media.status === "ready" ? workspace.media.value : null;
  const nextAction = inventory
    ? chooseNextAction(inventory.objects, today, workspaceCopy)
    : unavailableInventoryNextAction(workspaceCopy);
  const hasObjects = inventory ? inventory.totalCount > 0 : null;

  return (
    <main
      lang={locale}
      data-garden-workspace="operational-home"
      className="mx-auto flex w-full max-w-4xl flex-col"
    >
      <div className="px-4 pt-6 sm:px-6 sm:pt-8">
        <WorkspaceHeader
          eyebrow={workspaceCopy.workspace.headerEyebrow}
          title={copy.workspace.title}
          description={
            hasObjects === null
              ? copy.workspace.returningDescription
              : hasObjects
                ? copy.workspace.returningDescription
                : copy.workspace.emptyDescription
          }
        />

        <section className="flex flex-col gap-4 border-b border-border py-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase">
              {workspaceCopy.workspace.nextAction.eyebrow}
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-foreground">
              {nextAction.title}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              {nextAction.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={canWrite ? nextAction.href : "#write-access"}
              className={buttonVariants()}
            >
              <SquarePen aria-hidden="true" />
              {canWrite
                ? nextAction.label
                : workspaceCopy.workspace.nextAction.checkWriteAccess}
            </Link>
            <Link
              href="#first-entry-composer"
              className={buttonVariants({ variant: "outline" })}
            >
              <CirclePlus aria-hidden="true" />
              {workspaceCopy.workspace.nextAction.addObject}
            </Link>
          </div>
        </section>
      </div>

      <WorkspaceSummary
        copy={workspaceCopy}
        workspace={workspace}
        today={today}
      />

      <GardenWorkspaceLocalState
        ownerUserId={ownerUserId}
        locale={locale}
        nextAction={{ href: nextAction.href, label: nextAction.label }}
        recent={recent}
        inbox={inbox}
        media={media}
        initialState={localState}
      />

      <div className="flex flex-col gap-10 px-4 py-8 sm:px-6">
        <InventorySection
          canWrite={canWrite}
          copy={workspaceCopy}
          locale={locale}
          workspace={workspace}
          today={today}
        />
        <SpacesSection
          copy={workspaceCopy}
          locale={locale}
          workspace={workspace}
        />
        <RecentSection
          copy={workspaceCopy}
          locale={locale}
          workspace={workspace}
        />
        {children}
      </div>
    </main>
  );
}

function WorkspaceHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="border-b border-border pb-5">
      <p className="text-xs font-semibold text-muted-foreground uppercase">
        {eyebrow}
      </p>
      <h1 className="mt-1 text-3xl font-semibold text-foreground">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </header>
  );
}

function WorkspaceSummary({
  copy,
  workspace,
  today,
}: {
  copy: GardenWorkspaceCopy;
  workspace: GardenWorkspaceReadModel;
  today: string;
}) {
  const inventory =
    workspace.inventory.status === "ready" ? workspace.inventory.value : null;
  const spaces =
    workspace.spaces.status === "ready" ? workspace.spaces.value : null;
  const recent =
    workspace.recent.status === "ready" ? workspace.recent.value : [];

  return (
    <div
      role="list"
      aria-label={copy.workspace.summary.ariaLabel}
      className="grid grid-cols-2 border-b border-border bg-foreground text-background md:grid-cols-4"
    >
      <SummaryFact
        label={copy.workspace.summary.objects}
        value={inventory?.totalCount ?? "—"}
      />
      <SummaryFact
        label={copy.workspace.summary.spaces}
        value={spaces?.totalCount ?? "—"}
      />
      <SummaryFact
        label={copy.workspace.summary.recent}
        value={recent.length}
      />
      <SummaryFact
        label={copy.workspace.summary.dueInView}
        value={
          inventory
            ? inventory.objects.filter((object) => isUpdateDue(object, today))
                .length
            : "—"
        }
      />
    </div>
  );
}

function SummaryFact({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div
      role="listitem"
      className="min-w-0 border-r border-background/20 px-4 py-4 last:border-r-0 sm:px-5"
    >
      <span className="text-xs font-medium text-background/70 uppercase">
        {label}
      </span>
      <span className="mt-1 block text-2xl font-semibold tabular-nums">
        {value}
      </span>
    </div>
  );
}

function SpacesSection({
  copy,
  locale,
  workspace,
}: {
  copy: GardenWorkspaceCopy;
  locale: InterfaceLocale;
  workspace: GardenWorkspaceReadModel;
}) {
  if (workspace.spaces.status === "error") {
    return (
      <WorkspaceSectionError
        id="spaces"
        title={copy.workspace.spaces.errorTitle}
        copy={copy}
      />
    );
  }

  const spaces = workspace.spaces.value;
  return (
    <section id="spaces" className="min-w-0 scroll-mt-20">
      <SectionHeading
        eyebrow={copy.workspace.spaces.eyebrow}
        title={copy.workspace.spaces.title}
        description={copy.workspace.spaces.description}
        action={
          spaces.hasMore && spaces.page === 1 ? (
            <Link
              href="/garden?spaces=all#spaces"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {formatGardenWorkspaceTemplate(copy.workspace.spaces.viewAll, {
                count: spaces.totalCount,
              })}
            </Link>
          ) : null
        }
      />

      {spaces.spaces.length > 0 ? (
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {spaces.spaces.map((space) => (
            <SpaceRow
              key={space.id}
              copy={copy}
              locale={locale}
              space={space}
            />
          ))}
        </ul>
      ) : (
        <div className="mt-4 border-y border-dashed border-border py-6">
          <p className="text-sm text-muted-foreground">
            {copy.workspace.spaces.empty}
          </p>
        </div>
      )}

      {spaces.page > 1 || spaces.hasMore ? (
        <Pagination
          base="spaces"
          copy={copy}
          page={spaces.page}
          hasMore={spaces.hasMore}
        />
      ) : null}
    </section>
  );
}

function SpaceRow({
  copy,
  locale,
  space,
}: {
  copy: GardenWorkspaceCopy;
  locale: InterfaceLocale;
  space: GardenWorkspaceSpaceSummary;
}) {
  return (
    <li className="flex min-w-0 flex-wrap items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-foreground">
          {space.displayName}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatGardenCount(
            locale,
            space.objectCount,
            copy.workspace.spaces.counts.objects,
          )}{" "}
          ·{" "}
          {formatGardenCount(
            locale,
            space.plantCount,
            copy.workspace.spaces.counts.plants,
          )}{" "}
          ·{" "}
          {formatGardenCount(
            locale,
            space.animalCount,
            copy.workspace.spaces.counts.animals,
          )}{" "}
          ·{" "}
          {formatGardenCount(
            locale,
            space.beeColonyCount,
            copy.workspace.spaces.counts.colonies,
          )}
        </p>
      </div>
      <Link
        href={`/garden?space=${encodeURIComponent(space.id)}#space-journal`}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <BookOpenText aria-hidden="true" />
        {copy.workspace.spaces.openJournal}
      </Link>
    </li>
  );
}

function InventorySection({
  canWrite,
  copy,
  locale,
  workspace,
  today,
}: {
  canWrite: boolean;
  copy: GardenWorkspaceCopy;
  locale: InterfaceLocale;
  workspace: GardenWorkspaceReadModel;
  today: string;
}) {
  if (workspace.inventory.status === "error") {
    return (
      <WorkspaceSectionError
        id="inventory"
        title={copy.workspace.inventory.errorTitle}
        copy={copy}
      />
    );
  }

  const inventory = workspace.inventory.value;
  return (
    <section id="inventory" className="min-w-0 scroll-mt-20">
      <SectionHeading
        eyebrow={copy.workspace.inventory.eyebrow}
        title={copy.workspace.inventory.title}
        description={copy.workspace.inventory.description}
        action={
          inventory.hasMore && inventory.page === 1 ? (
            <Link
              href="/garden?inventory=all#inventory"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {formatGardenWorkspaceTemplate(copy.workspace.inventory.viewAll, {
                count: inventory.totalCount,
              })}
            </Link>
          ) : null
        }
      />

      <div
        role="list"
        aria-label={copy.workspace.inventory.ariaLabel}
        className="mt-4 grid grid-cols-3 border-y border-border bg-muted/30"
      >
        <KindFact
          icon={<Leaf aria-hidden="true" />}
          label={copy.workspace.inventory.plants}
          value={inventory.plantCount}
        />
        <KindFact
          icon={<PawPrint aria-hidden="true" />}
          label={copy.workspace.inventory.animals}
          value={inventory.animalCount}
        />
        <KindFact
          icon={<Bug aria-hidden="true" />}
          label={copy.workspace.inventory.beeColonies}
          value={inventory.beeColonyCount}
        />
      </div>

      {inventory.objects.length > 0 ? (
        <ol className="divide-y divide-border border-b border-border">
          {inventory.objects.map((object) => (
            <InventoryRow
              key={object.id}
              canWrite={canWrite}
              copy={copy}
              locale={locale}
              object={object}
              today={today}
            />
          ))}
        </ol>
      ) : (
        <div className="border-b border-dashed border-border py-8">
          <Sprout className="size-6 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-lg font-semibold text-foreground">
            {copy.workspace.inventory.emptyTitle}
          </h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            {copy.workspace.inventory.emptyDescription}
          </p>
          <Link
            href="#first-entry-composer"
            className={buttonVariants({ className: "mt-4" })}
          >
            <CirclePlus aria-hidden="true" />
            {copy.workspace.inventory.emptyAction}
          </Link>
        </div>
      )}

      {inventory.page > 1 || inventory.hasMore ? (
        <Pagination
          base="inventory"
          copy={copy}
          page={inventory.page}
          hasMore={inventory.hasMore}
        />
      ) : null}
    </section>
  );
}

function KindFact({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div
      role="listitem"
      className="min-w-0 border-r border-border px-3 py-3 last:border-r-0"
    >
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="[&>svg]:size-3.5">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <span className="mt-1 block text-lg font-semibold text-foreground tabular-nums">
        {value}
      </span>
    </div>
  );
}

function InventoryRow({
  canWrite,
  copy,
  locale,
  object,
  today,
}: {
  canWrite: boolean;
  copy: GardenWorkspaceCopy;
  locale: InterfaceLocale;
  object: PlantObjectSummary;
  today: string;
}) {
  const state = objectUpdateState(object, today, copy);
  return (
    <li className="grid min-w-0 gap-4 py-4 sm:grid-cols-4 sm:items-center">
      {object.coverMedia ? (
        <SubjectAwareMediaImage
          src={object.coverMedia.publicUrl}
          alt={object.coverMedia.altText}
          width={192}
          height={144}
          sizes="6rem"
          unoptimized
          presentationMode="cover"
          focalX={object.coverMedia.focalX}
          focalY={object.coverMedia.focalY}
          intrinsicWidth={object.coverMedia.intrinsicWidth}
          intrinsicHeight={object.coverMedia.intrinsicHeight}
          className="aspect-4/3 w-24 rounded-md border border-border"
        />
      ) : (
        <div className="flex aspect-4/3 w-24 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 text-muted-foreground">
          <ImageOff className="size-5" aria-hidden="true" />
        </div>
      )}

      <div className="min-w-0 sm:col-span-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Link
            href={`/garden/objects/${object.id}`}
            className="min-w-0 truncate text-base font-semibold text-foreground underline-offset-4 hover:underline"
          >
            {object.displayName}
          </Link>
          <span
            className={cn(
              "rounded-md border px-2 py-0.5 text-xs font-medium",
              state.due
                ? "border-amber-500/35 bg-amber-500/10 text-amber-800"
                : "border-border text-muted-foreground",
            )}
          >
            {state.label}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {localizedObjectKindLabel(object.objectKind, copy)} ·{" "}
          {object.spaceDisplayName}
        </p>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
          {objectCatalogSummary(object, copy)} ·{" "}
          {formatGardenCount(
            locale,
            object.entryCount,
            copy.workspace.inventory.entries,
          )}
          {object.archivedEntryCount > 0
            ? ` · ${object.archivedEntryCount} ${copy.workspace.inventory.archived}`
            : ""}
        </p>
      </div>

      <Link
        href={
          canWrite
            ? `/garden/objects/${object.id}#follow-up-composer`
            : `/garden/objects/${object.id}`
        }
        className={buttonVariants({
          variant: "outline",
          size: "sm",
          className: "w-fit sm:justify-self-end",
        })}
      >
        {canWrite ? (
          <Camera aria-hidden="true" />
        ) : (
          <ArrowRight aria-hidden="true" />
        )}
        {canWrite
          ? copy.workspace.inventory.addUpdate
          : copy.workspace.inventory.open}
      </Link>
    </li>
  );
}

function RecentSection({
  copy,
  locale,
  workspace,
}: {
  copy: GardenWorkspaceCopy;
  locale: InterfaceLocale;
  workspace: GardenWorkspaceReadModel;
}) {
  if (workspace.recent.status === "error") {
    return (
      <WorkspaceSectionError
        id="recent"
        title={copy.workspace.recent.errorTitle}
        copy={copy}
      />
    );
  }

  const entries = workspace.recent.value;
  return (
    <section id="recent" className="min-w-0 scroll-mt-20">
      <SectionHeading
        eyebrow={copy.workspace.recent.eyebrow}
        title={copy.workspace.recent.title}
        description={copy.workspace.recent.description}
      />
      {entries.length > 0 ? (
        <ol className="mt-4 divide-y divide-border border-y border-border">
          {entries.map((entry) => (
            <RecentRow
              key={entry.id}
              copy={copy}
              entry={entry}
              locale={locale}
            />
          ))}
        </ol>
      ) : (
        <p className="mt-4 border-y border-dashed border-border py-6 text-sm text-muted-foreground">
          {copy.workspace.recent.empty}
        </p>
      )}
    </section>
  );
}

function RecentRow({
  copy,
  entry,
  locale,
}: {
  copy: GardenWorkspaceCopy;
  entry: GardenWorkspaceRecentEntry;
  locale: InterfaceLocale;
}) {
  const href = entry.objectId
    ? `/garden/objects/${entry.objectId}`
    : `/garden#space-${entry.spaceId}`;
  const context = entry.objectDisplayName ?? entry.spaceDisplayName;
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <Link
          href={href}
          className="block truncate text-sm font-semibold text-foreground underline-offset-4 hover:underline"
        >
          {entry.title}
        </Link>
        <p className="mt-1 text-xs text-muted-foreground">
          {context} ·{" "}
          {entry.entryScope === "object"
            ? copy.workspace.recent.objectJournal
            : copy.workspace.recent.spaceJournal}
          {entry.lifecycleState === "archived"
            ? ` · ${copy.workspace.recent.archived}`
            : ""}
        </p>
      </div>
      <time className="text-xs text-muted-foreground">
        {formatGardenWorkspaceDate(locale, entry.entryDate)}
      </time>
    </li>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted-foreground uppercase">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-xl font-semibold text-foreground">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function WorkspaceSectionError({
  id,
  title,
  copy,
}: {
  id: string;
  title: string;
  copy: GardenWorkspaceCopy;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-y border-border py-6">
      <AlertTriangle className="size-5 text-destructive" aria-hidden="true" />
      <h2 className="mt-2 text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {copy.workspace.sectionError.description}
      </p>
      <Link
        href={`/garden#${id}`}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        {copy.workspace.sectionError.retry}
      </Link>
    </section>
  );
}

function Pagination({
  base,
  copy,
  page,
  hasMore,
}: {
  base: "inventory" | "spaces";
  copy: GardenWorkspaceCopy;
  page: number;
  hasMore: boolean;
}) {
  const pageParam = base === "inventory" ? "inventoryPage" : "spacesPage";
  const expandedParam = base === "inventory" ? "inventory" : "spaces";
  return (
    <nav
      aria-label={formatGardenWorkspaceTemplate(
        copy.workspace.pagination.ariaLabel,
        {
          section:
            base === "inventory"
              ? copy.workspace.inventory.title
              : copy.workspace.spaces.title,
        },
      )}
      className="mt-4 flex items-center justify-between gap-3"
    >
      {page > 1 ? (
        <Link
          href={`/garden?${expandedParam}=all&${pageParam}=${page - 1}#${base}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ArrowLeft aria-hidden="true" />
          {copy.workspace.pagination.previous}
        </Link>
      ) : (
        <span />
      )}
      {hasMore ? (
        <Link
          href={`/garden?${expandedParam}=all&${pageParam}=${page + 1}#${base}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {copy.workspace.pagination.next}
          <ArrowRight aria-hidden="true" />
        </Link>
      ) : null}
    </nav>
  );
}

interface WorkspaceNextAction {
  title: string;
  description: string;
  href: string;
  label: string;
}

function chooseNextAction(
  objects: PlantObjectSummary[],
  today: string,
  copy: GardenWorkspaceCopy,
): WorkspaceNextAction {
  if (objects.length === 0) {
    return {
      title: copy.workspace.nextAction.emptyTitle,
      description: copy.workspace.nextAction.emptyDescription,
      href: "#first-entry-composer",
      label: copy.workspace.nextAction.startFirstObject,
    };
  }

  const object = [...objects].sort(compareUpdatePriority)[0];
  if (!object.latestEntryDate || object.entryCount === 0) {
    return {
      title: formatGardenWorkspaceTemplate(
        copy.workspace.nextAction.finishFirstNoteTitle,
        { objectName: object.displayName },
      ),
      description: copy.workspace.nextAction.finishFirstNoteDescription,
      href: `/garden/objects/${object.id}#follow-up-composer`,
      label: copy.workspace.nextAction.addFirstNote,
    };
  }

  const due = isUpdateDue(object, today);
  return {
    title: due
      ? formatGardenWorkspaceTemplate(copy.workspace.nextAction.updateTitle, {
          objectName: object.displayName,
        })
      : formatGardenWorkspaceTemplate(copy.workspace.nextAction.continueTitle, {
          objectName: object.displayName,
        }),
    description: due
      ? copy.workspace.nextAction.dueDescription
      : copy.workspace.nextAction.currentDescription,
    href: `/garden/objects/${object.id}#follow-up-composer`,
    label: copy.workspace.nextAction.addUpdate,
  };
}

function unavailableInventoryNextAction(
  copy: GardenWorkspaceCopy,
): WorkspaceNextAction {
  return {
    title: copy.workspace.nextAction.unavailableTitle,
    description: copy.workspace.nextAction.unavailableDescription,
    href: "/garden#inventory",
    label: copy.workspace.nextAction.retryInventory,
  };
}

function compareUpdatePriority(
  left: PlantObjectSummary,
  right: PlantObjectSummary,
) {
  return (
    entryTimestamp(left.latestEntryDate) - entryTimestamp(right.latestEntryDate)
  );
}

function objectCatalogSummary(
  object: PlantObjectSummary,
  copy: GardenWorkspaceCopy,
) {
  const identity = object.varietyText
    ? `${localizedCatalogIdentityLabel(
        object.catalogKind,
        object.objectKind,
        copy,
      )}: ${object.varietyText}`
    : copy.workspace.objectState.unknownCatalogIdentity;
  return `${identity} · ${localizedVarietyStateLabel(object.varietyState, copy)}`;
}

function objectUpdateState(
  object: PlantObjectSummary,
  today: string,
  copy: GardenWorkspaceCopy,
) {
  if (!object.latestEntryDate || object.entryCount === 0) {
    return { label: copy.workspace.objectState.needsFirstNote, due: true };
  }
  const days = daysBetween(object.latestEntryDate, today);
  if (days > 14) {
    return {
      label: formatGardenWorkspaceTemplate(
        copy.workspace.objectState.daysSinceUpdate,
        { count: days },
      ),
      due: true,
    };
  }
  if (days === 0) {
    return { label: copy.workspace.objectState.updatedToday, due: false };
  }
  return {
    label: formatGardenWorkspaceTemplate(copy.workspace.objectState.daysAgo, {
      count: days,
    }),
    due: false,
  };
}

function isUpdateDue(object: PlantObjectSummary, today: string) {
  if (!object.latestEntryDate || object.entryCount === 0) return true;
  return daysBetween(object.latestEntryDate, today) > 14;
}

function daysBetween(left: Date | string, right: Date | string) {
  const leftDate = parseDateOnly(left);
  const rightDate = parseDateOnly(right);
  return Math.max(
    0,
    Math.floor((rightDate.getTime() - leftDate.getTime()) / 86_400_000),
  );
}

function parseDateOnly(value: Date | string) {
  if (value instanceof Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
}

function entryTimestamp(value: Date | string | null) {
  return value ? parseDateOnly(value).getTime() : 0;
}

function localizedObjectKindLabel(
  value: string | null | undefined,
  copy: GardenWorkspaceCopy,
) {
  if (value === "bee_colony") return copy.composer.objectKind.beeColony.label;
  if (value === "animal") return copy.composer.objectKind.animal.label;
  return copy.composer.objectKind.plant.label;
}

function localizedCatalogIdentityLabel(
  value: string | null | undefined,
  objectKind: string | null | undefined,
  copy: GardenWorkspaceCopy,
) {
  if (value === "breed") {
    if (objectKind === "bee_colony") return copy.composer.catalogKinds.beeBreed;
    if (objectKind === "animal") return copy.composer.catalogKinds.animalBreed;
    return copy.composer.catalogKinds.breed;
  }
  if (value === "species") return copy.composer.catalogKinds.species;
  if (value === "plant_variety") return copy.composer.catalogKinds.plantVariety;
  return copy.composer.catalogKinds.identity;
}

function localizedVarietyStateLabel(
  value: string | null | undefined,
  copy: GardenWorkspaceCopy,
) {
  if (value === "selected") return copy.composer.varietyStates.selected;
  if (value === "user_added") return copy.composer.varietyStates.userAdded;
  if (value === "free_text") return copy.composer.varietyStates.freeText;
  if (value === "unknown") return copy.composer.varietyStates.unknown;
  return copy.composer.varietyStates.unset;
}
