import Image from "next/image";
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

import { buttonVariants } from "@/components/ui/button";
import {
  getInterfaceCopy,
  type InterfaceLocale,
} from "@/lib/interface-localization";
import {
  catalogIdentityLabel,
  plantObjectKindLabel,
  varietyStateLabel,
} from "@/lib/garden/pilot-ux-copy";
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

  if (workspace.allFailed) {
    return (
      <main
        lang={locale}
        data-garden-workspace="error"
        className="mx-auto flex w-full max-w-4xl flex-col px-4 py-6 sm:px-6 sm:py-8"
      >
        <WorkspaceHeader
          title={copy.workspace.title}
          description={copy.workspace.returningDescription}
        />
        <section className="mt-8 border-y border-border py-8">
          <AlertTriangle
            className="size-6 text-destructive"
            aria-hidden="true"
          />
          <h2 className="mt-3 text-xl font-semibold text-foreground">
            Workspace data is temporarily unavailable
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Your garden data was not changed. Reload the owner-scoped readback
            before adding another update.
          </p>
          <Link
            href="/garden"
            className={buttonVariants({ className: "mt-4" })}
          >
            <RefreshCw aria-hidden="true" />
            Try again
          </Link>
        </section>
        <GardenWorkspaceLocalState
          ownerUserId={ownerUserId}
          locale={locale}
          nextAction={{ href: "/garden", label: "Retry workspace" }}
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
    ? chooseNextAction(inventory.objects, today)
    : unavailableInventoryNextAction();
  const hasObjects = inventory ? inventory.totalCount > 0 : null;

  return (
    <main
      lang={locale}
      data-garden-workspace="operational-home"
      className="mx-auto flex w-full max-w-4xl flex-col"
    >
      <div className="px-4 pt-6 sm:px-6 sm:pt-8">
        <WorkspaceHeader
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
              Next useful action
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
              {canWrite ? nextAction.label : "Check write access"}
            </Link>
            <Link
              href="#first-entry-composer"
              className={buttonVariants({ variant: "outline" })}
            >
              <CirclePlus aria-hidden="true" />
              Add object
            </Link>
          </div>
        </section>
      </div>

      <WorkspaceSummary workspace={workspace} today={today} />

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
          workspace={workspace}
          today={today}
        />
        <SpacesSection workspace={workspace} />
        <RecentSection workspace={workspace} />
        {children}
      </div>
    </main>
  );
}

function WorkspaceHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="border-b border-border pb-5">
      <p className="text-xs font-semibold text-muted-foreground uppercase">
        My garden
      </p>
      <h1 className="mt-1 text-3xl font-semibold text-foreground">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </header>
  );
}

function WorkspaceSummary({
  workspace,
  today,
}: {
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
      aria-label="Garden summary"
      className="grid grid-cols-2 border-b border-border bg-foreground text-background sm:grid-cols-4"
    >
      <SummaryFact label="Objects" value={inventory?.totalCount ?? "—"} />
      <SummaryFact label="Spaces" value={spaces?.totalCount ?? "—"} />
      <SummaryFact label="Recent" value={recent.length} />
      <SummaryFact
        label="Due in view"
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

function SpacesSection({ workspace }: { workspace: GardenWorkspaceReadModel }) {
  if (workspace.spaces.status === "error") {
    return (
      <WorkspaceSectionError
        id="spaces"
        title="Spaces are temporarily unavailable"
      />
    );
  }

  const spaces = workspace.spaces.value;
  return (
    <section id="spaces" className="min-w-0 scroll-mt-20">
      <SectionHeading
        eyebrow="Organization"
        title="Spaces"
        description="Spaces group related objects, but you can add the first object without creating a taxonomy first."
        action={
          spaces.hasMore && spaces.page === 1 ? (
            <Link
              href="/garden?spaces=all#spaces"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              View all {spaces.totalCount} spaces
            </Link>
          ) : null
        }
      />

      {spaces.spaces.length > 0 ? (
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {spaces.spaces.map((space) => (
            <SpaceRow key={space.id} space={space} />
          ))}
        </ul>
      ) : (
        <div className="mt-4 border-y border-dashed border-border py-6">
          <p className="text-sm text-muted-foreground">
            No spaces yet. Your first object can create the default workspace
            without an extra setup step.
          </p>
        </div>
      )}

      {spaces.page > 1 || spaces.hasMore ? (
        <Pagination base="spaces" page={spaces.page} hasMore={spaces.hasMore} />
      ) : null}
    </section>
  );
}

function SpaceRow({ space }: { space: GardenWorkspaceSpaceSummary }) {
  return (
    <li className="flex min-w-0 flex-wrap items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-foreground">
          {space.displayName}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {space.objectCount} objects · {space.plantCount} plants ·{" "}
          {space.animalCount} animals · {space.beeColonyCount} colonies
        </p>
      </div>
      <Link
        href={`/garden?space=${encodeURIComponent(space.id)}#space-journal`}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <BookOpenText aria-hidden="true" />
        Open journal
      </Link>
    </li>
  );
}

function InventorySection({
  canWrite,
  workspace,
  today,
}: {
  canWrite: boolean;
  workspace: GardenWorkspaceReadModel;
  today: string;
}) {
  if (workspace.inventory.status === "error") {
    return (
      <WorkspaceSectionError
        id="inventory"
        title="Living objects are temporarily unavailable"
      />
    );
  }

  const inventory = workspace.inventory.value;
  return (
    <section id="inventory" className="min-w-0 scroll-mt-20">
      <SectionHeading
        eyebrow="Owned inventory"
        title="Living objects"
        description="Plants, animals, and colonies stay in one operational list with their latest continuity cue."
        action={
          inventory.hasMore && inventory.page === 1 ? (
            <Link
              href="/garden?inventory=all#inventory"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              View all {inventory.totalCount} objects
            </Link>
          ) : null
        }
      />

      <div
        role="list"
        aria-label="Inventory by kind"
        className="mt-4 grid grid-cols-3 border-y border-border bg-muted/30"
      >
        <KindFact
          icon={<Leaf aria-hidden="true" />}
          label="Plants"
          value={inventory.plantCount}
        />
        <KindFact
          icon={<PawPrint aria-hidden="true" />}
          label="Animals"
          value={inventory.animalCount}
        />
        <KindFact
          icon={<Bug aria-hidden="true" />}
          label="Bee colonies"
          value={inventory.beeColonyCount}
        />
      </div>

      {inventory.objects.length > 0 ? (
        <ol className="divide-y divide-border border-b border-border">
          {inventory.objects.map((object) => (
            <InventoryRow
              key={object.id}
              canWrite={canWrite}
              object={object}
              today={today}
            />
          ))}
        </ol>
      ) : (
        <div className="border-b border-dashed border-border py-8">
          <Sprout className="size-6 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-lg font-semibold text-foreground">
            Start with one living object
          </h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Save one dated story to create the first private object and its
            useful history in the same path.
          </p>
          <Link
            href="#first-entry-composer"
            className={buttonVariants({ className: "mt-4" })}
          >
            <CirclePlus aria-hidden="true" />
            Start first object
          </Link>
        </div>
      )}

      {inventory.page > 1 || inventory.hasMore ? (
        <Pagination
          base="inventory"
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
  object,
  today,
}: {
  canWrite: boolean;
  object: PlantObjectSummary;
  today: string;
}) {
  const state = objectUpdateState(object, today);
  return (
    <li className="grid min-w-0 gap-4 py-4 sm:grid-cols-4 sm:items-center">
      {object.coverMedia ? (
        <Image
          src={object.coverMedia.publicUrl}
          alt={object.coverMedia.altText}
          width={192}
          height={144}
          sizes="6rem"
          unoptimized
          className="aspect-4/3 w-24 rounded-md border border-border object-cover"
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
          {plantObjectKindLabel(object.objectKind)} · {object.spaceDisplayName}
        </p>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
          {objectCatalogSummary(object)} · {object.entryCount} entries
          {object.archivedEntryCount > 0
            ? ` · ${object.archivedEntryCount} archived`
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
        {canWrite ? "Add update" : "Open"}
      </Link>
    </li>
  );
}

function RecentSection({ workspace }: { workspace: GardenWorkspaceReadModel }) {
  if (workspace.recent.status === "error") {
    return (
      <WorkspaceSectionError
        id="recent"
        title="Recent updates are temporarily unavailable"
      />
    );
  }

  const entries = workspace.recent.value;
  return (
    <section id="recent" className="min-w-0 scroll-mt-20">
      <SectionHeading
        eyebrow="Journal"
        title="Recent continuity"
        description="The newest dated records across object and space journals. Private text is not repeated in this overview."
      />
      {entries.length > 0 ? (
        <ol className="mt-4 divide-y divide-border border-y border-border">
          {entries.map((entry) => (
            <RecentRow key={entry.id} entry={entry} />
          ))}
        </ol>
      ) : (
        <p className="mt-4 border-y border-dashed border-border py-6 text-sm text-muted-foreground">
          No dated activity yet. The first saved entry will appear here.
        </p>
      )}
    </section>
  );
}

function RecentRow({ entry }: { entry: GardenWorkspaceRecentEntry }) {
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
          {entry.entryScope === "object" ? "Object journal" : "Space journal"}
          {entry.lifecycleState === "archived" ? " · Archived" : ""}
        </p>
      </div>
      <time className="text-xs text-muted-foreground">
        {formatDate(entry.entryDate)}
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

function WorkspaceSectionError({ id, title }: { id: string; title: string }) {
  return (
    <section id={id} className="scroll-mt-20 border-y border-border py-6">
      <AlertTriangle className="size-5 text-destructive" aria-hidden="true" />
      <h2 className="mt-2 text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Other workspace sections remain available. No data was changed.
      </p>
      <Link
        href={`/garden#${id}`}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        Try this section again
      </Link>
    </section>
  );
}

function Pagination({
  base,
  page,
  hasMore,
}: {
  base: "inventory" | "spaces";
  page: number;
  hasMore: boolean;
}) {
  const pageParam = base === "inventory" ? "inventoryPage" : "spacesPage";
  const expandedParam = base === "inventory" ? "inventory" : "spaces";
  return (
    <nav
      aria-label={`${base} pagination`}
      className="mt-4 flex items-center justify-between gap-3"
    >
      {page > 1 ? (
        <Link
          href={`/garden?${expandedParam}=all&${pageParam}=${page - 1}#${base}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ArrowLeft aria-hidden="true" />
          Previous
        </Link>
      ) : (
        <span />
      )}
      {hasMore ? (
        <Link
          href={`/garden?${expandedParam}=all&${pageParam}=${page + 1}#${base}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Next
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
): WorkspaceNextAction {
  if (objects.length === 0) {
    return {
      title: "Start with one living object",
      description:
        "Create the first private record before the workspace asks for anything else.",
      href: "#first-entry-composer",
      label: "Start first object",
    };
  }

  const object = [...objects].sort(compareUpdatePriority)[0];
  if (!object.latestEntryDate || object.entryCount === 0) {
    return {
      title: `Finish the first note for ${object.displayName}`,
      description:
        "The object exists, but a dated observation is still needed before its history becomes useful.",
      href: `/garden/objects/${object.id}#follow-up-composer`,
      label: "Add first note",
    };
  }

  const due = isUpdateDue(object, today);
  return {
    title: due
      ? `Update ${object.displayName}`
      : `Continue ${object.displayName}`,
    description: due
      ? "Its latest direct update is old enough that a fresh observation would restore continuity."
      : "The workspace is current. Add the next observable change when it happens.",
    href: `/garden/objects/${object.id}#follow-up-composer`,
    label: "Add update",
  };
}

function unavailableInventoryNextAction(): WorkspaceNextAction {
  return {
    title: "Restore your living-object inventory",
    description:
      "Recent activity is still available, but the inventory must reload before the workspace can choose a trustworthy next object.",
    href: "/garden#inventory",
    label: "Retry inventory",
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

function objectCatalogSummary(object: PlantObjectSummary) {
  const identity = object.varietyText
    ? `${catalogIdentityLabel(object.catalogKind, object.objectKind)}: ${object.varietyText}`
    : "Unknown catalog identity";
  return `${identity} · ${varietyStateLabel(object.varietyState)}`;
}

function objectUpdateState(object: PlantObjectSummary, today: string) {
  if (!object.latestEntryDate || object.entryCount === 0) {
    return { label: "Needs first note", due: true };
  }
  const days = daysBetween(object.latestEntryDate, today);
  if (days > 14) return { label: `${days} days since update`, due: true };
  if (days === 0) return { label: "Updated today", due: false };
  return { label: `${days} days ago`, due: false };
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

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
