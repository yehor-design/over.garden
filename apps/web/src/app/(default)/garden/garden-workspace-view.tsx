import Link from "next/link";
import { OwnedDestinationNavigation } from "@/components/garden/owned-destination-navigation";
import { ArrowRightIcon as ArrowRight } from "@/components/icons/ArrowRight";
import { BookOpenTextIcon as BookOpenText } from "@/components/icons/BookOpenText";
import { CameraIcon as Camera } from "@/components/icons/Camera";
import { PlusIcon as Plus } from "@/components/icons/Plus";
import { PlusCircleIcon as CirclePlus } from "@/components/icons/PlusCircle";
import { ImageBrokenIcon as ImageOff } from "@/components/icons/ImageBroken";
import { LeafIcon as Leaf } from "@/components/icons/Leaf";
import { PawPrintIcon as PawPrint } from "@/components/icons/PawPrint";
import { NotePencilIcon as SquarePen } from "@/components/icons/NotePencil";

import { SubjectAwareMediaImage } from "@/components/media/subject-aware-media-image";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { Pagination } from "@/components/ui/pagination";
import { Section } from "@/components/ui/section";
import {
  formatGardenCount,
  formatGardenWorkspaceDate,
  formatGardenWorkspaceTemplate,
  getGardenWorkspaceCopy,
  type GardenWorkspaceCopy,
} from "@/lib/garden-workspace-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";
import type {
  GardenWorkspaceReadModel,
  GardenWorkspaceRecentEntry,
  GardenWorkspaceSpaceSummary,
} from "@/server/garden-workspace-repository";
import type { PlantObjectSummary } from "@/server/journal-repository";
import { WorkspaceSectionError } from "@/components/garden/workspace-state";
import { GardenWorkspaceServiceState } from "./garden-workspace-service-state";

interface GardenWorkspaceViewProps {
  canWrite: boolean;
  locale: InterfaceLocale;
  today: string;
  workspace: GardenWorkspaceReadModel;
  children?: React.ReactNode;
}

/**
 * The garden home, in the order a gardener asks (`OVE-457`, ADR-0031 D4).
 *
 * It used to open with a next-action strip and then a band of four numbers on
 * an inverted bar — objects, spaces, recent, due — which is a menu of links and
 * a scoreboard, not an answer. Remote and Laravel Cloud are the model: a
 * workspace home leads with **state**.
 *
 * So: what needs attention, then what you wrote last, and only then the
 * inventory and the spaces that hold them. Every count of nought is omitted
 * rather than printed (DESIGN.md §5.10) — the empty state below already says
 * that nothing is happening, in words.
 *
 * Every section is a value: `GardenWorkspaceReadModel` settles its four reads
 * and each one renders either its rows or its own designed failure. Nothing
 * here throws, because a Server Component that throws during a postponed
 * resume leaves its boundary pending forever on a hard load (ADR-0023).
 */
export function GardenWorkspaceView({
  canWrite,
  locale,
  today,
  workspace,
  children,
}: GardenWorkspaceViewProps) {
  const copy = getGardenWorkspaceCopy(locale);

  // `allFailed` means every section carries a class; inventory is named here so
  // the panel can print one digest, and the narrowing is free.
  if (workspace.allFailed && workspace.inventory.status === "error") {
    return (
      <div
        data-garden-workspace="error"
        className="flex flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8"
      >
        <WorkspaceSectionError
          locale={locale}
          failure={workspace.inventory}
          title={copy.workspace.error.title}
          retryHref="/garden"
          retryLabel={copy.workspace.error.retry}
        />
        <GardenWorkspaceServiceState
          locale={locale}
          nextAction={{
            href: "/garden",
            label: copy.workspace.error.retryAction,
          }}
          recent={[]}
          inbox={null}
        />
      </div>
    );
  }

  const inventory =
    workspace.inventory.status === "ready" ? workspace.inventory.value : null;
  const recent =
    workspace.recent.status === "ready" ? workspace.recent.value : [];
  const spaces =
    workspace.spaces.status === "ready" ? workspace.spaces.value : null;
  const inbox =
    workspace.inbox.status === "ready" ? workspace.inbox.value : null;
  const nextAction = inventory
    ? chooseNextAction(inventory.objects, today, copy)
    : unavailableInventoryNextAction(copy);
  const dueObjects = inventory
    ? inventory.objects.filter((object) => isUpdateDue(object, today))
    : [];

  return (
    <div
      data-garden-workspace="operational-home"
      className="flex flex-col gap-10 px-4 py-6 sm:px-6 sm:py-8"
    >
      <AttentionSection
        canWrite={canWrite}
        copy={copy}
        locale={locale}
        workspace={workspace}
        dueObjects={dueObjects}
        nextAction={nextAction}
        today={today}
      />

      <GardenWorkspaceServiceState
        locale={locale}
        nextAction={{ href: nextAction.href, label: nextAction.label }}
        recent={recent}
        inbox={inbox}
      />

      <RecentSection copy={copy} locale={locale} workspace={workspace} />
      <InventorySection
        canWrite={canWrite}
        copy={copy}
        locale={locale}
        workspace={workspace}
        today={today}
      />
      <SpacesSection copy={copy} locale={locale} workspace={workspace} />
      <GardenFacts copy={copy} inventory={inventory} spaces={spaces} />
      {children}
    </div>
  );
}

/**
 * What the gardener came to find out. The one primary action of the screen is
 * here, beside the objects it is about — a button at the top of a page whose
 * subject is three sections down is a button a reader has to trust.
 */
function AttentionSection({
  canWrite,
  copy,
  locale,
  workspace,
  dueObjects,
  nextAction,
  today,
}: {
  canWrite: boolean;
  copy: GardenWorkspaceCopy;
  locale: InterfaceLocale;
  workspace: GardenWorkspaceReadModel;
  dueObjects: PlantObjectSummary[];
  nextAction: WorkspaceNextAction;
  today: string;
}) {
  if (workspace.inventory.status === "error") {
    return (
      <WorkspaceSectionError
        id="attention"
        locale={locale}
        title={copy.workspace.inventory.errorTitle}
        failure={workspace.inventory}
        retryHref="/garden#attention"
      />
    );
  }

  return (
    <Section
      id="attention"
      title={copy.workspace.attention.title}
      description={copy.workspace.attention.description}
      className="scroll-mt-20"
      actions={
        dueObjects.length > 0 ? (
          <Badge tone="warning">
            {formatGardenWorkspaceTemplate(
              copy.workspace.attention.countLabel,
              {
                count: dueObjects.length,
              },
            )}
          </Badge>
        ) : undefined
      }
    >
      <Callout tone="info" data-garden-next-action="true">
        <p className="text-h4 text-text-heading">{nextAction.title}</p>
        <p className="mt-1">{nextAction.description}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={canWrite ? nextAction.href : "#write-access"}
            className={buttonVariants()}
          >
            <SquarePen aria-hidden="true" />
            {canWrite
              ? nextAction.label
              : copy.workspace.nextAction.checkWriteAccess}
          </Link>
          {/* Adding a plant or an animal is its own short setup, apart from
              writing (OVE-485); the first entry is written from its page. */}
          <Link
            href="/garden/objects/new"
            data-garden-new-object="true"
            className={buttonVariants({ variant: "secondary" })}
          >
            <CirclePlus aria-hidden="true" />
            {copy.workspace.nextAction.addObject}
          </Link>
        </div>
      </Callout>

      {dueObjects.length > 0 ? (
        <ul className="grid">
          {dueObjects.slice(0, 5).map((object) => (
            <ObjectRow
              key={object.id}
              canWrite={canWrite}
              copy={copy}
              locale={locale}
              object={object}
              today={today}
              media={false}
            />
          ))}
        </ul>
      ) : (
        <EmptyState
          title={copy.workspace.attention.emptyTitle}
          description={copy.workspace.attention.emptyDescription}
        />
      )}
    </Section>
  );
}

/**
 * What the gardener wrote last. Second, because "did what I wrote land?" is
 * the other question a workspace home exists to answer.
 */
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
        locale={locale}
        title={copy.workspace.recent.errorTitle}
        failure={workspace.recent}
        retryHref="/garden#recent"
      />
    );
  }

  const entries = workspace.recent.value;
  return (
    <Section
      id="recent"
      title={copy.workspace.recent.title}
      description={copy.workspace.recent.description}
      className="scroll-mt-20"
    >
      {entries.length > 0 ? (
        <ul className="grid">
          {entries.map((entry) => (
            <RecentRow
              key={entry.id}
              copy={copy}
              entry={entry}
              locale={locale}
            />
          ))}
        </ul>
      ) : (
        <EmptyState
          title={copy.workspace.recent.title}
          description={copy.workspace.recent.empty}
        />
      )}
    </Section>
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
    <ListRow
      title={entry.title}
      href={href}
      description={`${context} · ${
        entry.entryScope === "object"
          ? copy.workspace.recent.objectJournal
          : copy.workspace.recent.spaceJournal
      }`}
      meta={formatGardenWorkspaceDate(locale, entry.entryDate)}
    />
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
    // The attention section above already carries this failure's class and
    // digest; a second copy of the same panel says nothing new.
    return null;
  }

  const inventory = workspace.inventory.value;
  return (
    <Section
      id="inventory"
      title={copy.workspace.inventory.title}
      description={copy.workspace.inventory.description}
      className="scroll-mt-20"
      actions={
        <>
          {inventory.hasMore && inventory.page === 1 ? (
            <Link
              href="/garden?inventory=all#inventory"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              {formatGardenWorkspaceTemplate(copy.workspace.inventory.viewAll, {
                count: inventory.totalCount,
              })}
            </Link>
          ) : null}
          <Link
            href="/garden/objects/new"
            data-garden-inventory-new-object="true"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            <Plus aria-hidden="true" />
            {copy.workspace.inventory.newObject}
          </Link>
        </>
      }
    >
      <OwnedDestinationNavigation locale={locale} />
      {inventory.objects.length > 0 ? (
        <>
          {/* A count of nought is the absence of a fact (DESIGN.md §5.10): a
              garden with no animals says nothing about animals. */}
          <div className="flex flex-wrap gap-2">
            {inventory.plantCount > 0 ? (
              <Badge>
                <Leaf aria-hidden="true" />
                {copy.workspace.inventory.plants} {inventory.plantCount}
              </Badge>
            ) : null}
            {inventory.animalCount > 0 ? (
              <Badge>
                <PawPrint aria-hidden="true" />
                {copy.workspace.inventory.animals} {inventory.animalCount}
              </Badge>
            ) : null}
          </div>
          <ul className="grid">
            {inventory.objects.map((object) => (
              <ObjectRow
                key={object.id}
                canWrite={canWrite}
                copy={copy}
                locale={locale}
                object={object}
                today={today}
              />
            ))}
          </ul>
        </>
      ) : (
        <EmptyState
          title={copy.workspace.inventory.emptyTitle}
          description={copy.workspace.inventory.emptyDescription}
          action={
            <Link href="#first-entry-composer" className={buttonVariants()}>
              <CirclePlus aria-hidden="true" />
              {copy.workspace.inventory.emptyAction}
            </Link>
          }
        />
      )}

      {inventory.page > 1 || inventory.hasMore ? (
        <WorkspacePagination
          base="inventory"
          copy={copy}
          page={inventory.page}
          hasMore={inventory.hasMore}
        />
      ) : null}
    </Section>
  );
}

/** One living object, in the two places the home lists one. */
function ObjectRow({
  canWrite,
  copy,
  locale,
  object,
  today,
  media = true,
}: {
  canWrite: boolean;
  copy: GardenWorkspaceCopy;
  locale: InterfaceLocale;
  object: PlantObjectSummary;
  today: string;
  media?: boolean;
}) {
  const state = objectUpdateState(object, today, copy);
  return (
    <ListRow
      title={object.displayName}
      href={`/garden/objects/${object.id}`}
      media={media ? <ObjectThumbnail object={object} /> : undefined}
      description={
        <>
          <Badge tone={state.due ? "warning" : "neutral"}>{state.label}</Badge>{" "}
          {localizedObjectKindLabel(object.objectKind, copy)} ·{" "}
          {object.spaceDisplayName}
        </>
      }
      meta={`${objectCatalogSummary(object, copy)} · ${formatGardenCount(
        locale,
        object.entryCount,
        copy.workspace.inventory.entries,
      )}`}
      actions={
        <Link
          href={
            canWrite
              ? `/garden/objects/${object.id}#follow-up-composer`
              : `/garden/objects/${object.id}`
          }
          className={buttonVariants({ variant: "secondary", size: "sm" })}
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
      }
    />
  );
}

function ObjectThumbnail({ object }: { object: PlantObjectSummary }) {
  if (!object.coverMedia) {
    return (
      <div className="flex aspect-4/3 w-24 items-center justify-center rounded-md border border-dashed border-border bg-surface-sunken text-text-muted">
        <ImageOff className="size-5" aria-hidden="true" />
      </div>
    );
  }
  return (
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
        locale={locale}
        title={copy.workspace.spaces.errorTitle}
        failure={workspace.spaces}
        retryHref="/garden#spaces"
      />
    );
  }

  const spaces = workspace.spaces.value;
  return (
    <Section
      id="spaces"
      title={copy.workspace.spaces.title}
      description={copy.workspace.spaces.description}
      className="scroll-mt-20"
      actions={
        <>
          {spaces.hasMore && spaces.page === 1 ? (
            <Link
              href="/garden?spaces=all#spaces"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              {formatGardenWorkspaceTemplate(copy.workspace.spaces.viewAll, {
                count: spaces.totalCount,
              })}
            </Link>
          ) : null}
          {/* Setting up a space is its own short task, apart from writing
              (OVE-484). */}
          <Link
            href="/garden/spaces/new"
            data-garden-new-space="true"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            <Plus aria-hidden="true" />
            {copy.workspace.spaces.newSpace}
          </Link>
        </>
      }
    >
      {spaces.spaces.length > 0 ? (
        <ul className="grid">
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
        <EmptyState
          title={copy.workspace.spaces.title}
          description={copy.workspace.spaces.empty}
        />
      )}

      {spaces.page > 1 || spaces.hasMore ? (
        <WorkspacePagination
          base="spaces"
          copy={copy}
          page={spaces.page}
          hasMore={spaces.hasMore}
        />
      ) : null}
    </Section>
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
    <ListRow
      title={space.displayName}
      meta={[
        formatGardenCount(
          locale,
          space.objectCount,
          copy.workspace.spaces.counts.objects,
        ),
        formatGardenCount(
          locale,
          space.plantCount,
          copy.workspace.spaces.counts.plants,
        ),
        formatGardenCount(
          locale,
          space.animalCount,
          copy.workspace.spaces.counts.animals,
        ),
      ].join(" · ")}
      actions={
        <Link
          href={`/garden?space=${encodeURIComponent(space.id)}#space-journal`}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          <BookOpenText aria-hidden="true" />
          {copy.workspace.spaces.openJournal}
        </Link>
      }
    />
  );
}

/**
 * The shape of the garden, in one line, at the foot of the page.
 *
 * It used to be four numbers on an inverted bar above everything — the most
 * valuable row on the screen spent on a scoreboard, and printing `0` three
 * times for a gardener who had just arrived. A nought is omitted.
 */
function GardenFacts({
  copy,
  inventory,
  spaces,
}: {
  copy: GardenWorkspaceCopy;
  inventory: { totalCount: number } | null;
  spaces: { totalCount: number } | null;
}) {
  const facts = [
    inventory && inventory.totalCount > 0
      ? `${copy.workspace.summary.objects}: ${inventory.totalCount}`
      : null,
    spaces && spaces.totalCount > 0
      ? `${copy.workspace.summary.spaces}: ${spaces.totalCount}`
      : null,
  ].filter((fact): fact is string => fact !== null);
  if (facts.length === 0) return null;

  return (
    <p
      data-garden-facts="true"
      aria-label={copy.workspace.summary.ariaLabel}
      className="flex flex-wrap gap-2 border-t border-border pt-4 text-caption text-text-muted tabular-nums"
    >
      {facts.map((fact) => (
        <span key={fact}>{fact}</span>
      ))}
    </p>
  );
}

function WorkspacePagination({
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
    <Pagination
      label={formatGardenWorkspaceTemplate(
        copy.workspace.pagination.ariaLabel,
        {
          section:
            base === "inventory"
              ? copy.workspace.inventory.title
              : copy.workspace.spaces.title,
        },
      )}
      previousLabel={copy.workspace.pagination.previous}
      previousHref={
        page > 1
          ? `/garden?${expandedParam}=all&${pageParam}=${page - 1}#${base}`
          : null
      }
      nextLabel={copy.workspace.pagination.next}
      nextHref={
        hasMore
          ? `/garden?${expandedParam}=all&${pageParam}=${page + 1}#${base}`
          : null
      }
    />
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
  if (value === "animal") return copy.composer.objectKind.animal.label;
  return copy.composer.objectKind.plant.label;
}

function localizedCatalogIdentityLabel(
  value: string | null | undefined,
  objectKind: string | null | undefined,
  copy: GardenWorkspaceCopy,
) {
  if (value === "breed") {
    if (objectKind === "animal") {
      return copy.composer.catalogKinds.animalBreed;
    }
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
  if (value === "free_text") return copy.composer.varietyStates.freeText;
  if (value === "unknown") return copy.composer.varietyStates.unknown;
  return copy.composer.varietyStates.unset;
}
