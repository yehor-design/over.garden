import Link from "next/link";

import { MagnifyingGlassIcon } from "@/components/icons/MagnifyingGlass";
import { NotePencilIcon } from "@/components/icons/NotePencil";
import { PlusIcon } from "@/components/icons/Plus";
import { WorkspaceSectionError } from "@/components/garden/workspace-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { FilterBar } from "@/components/ui/filter-bar";
import { SearchInput } from "@/components/ui/search-input";
import { Section } from "@/components/ui/section";
import {
  GARDEN_COLLECTION_PAGE_SIZE,
  GARDEN_COLLECTION_QUERY_LIMIT,
  GARDEN_SPACES_PREVIEW_SIZE,
  gardenCollectionHref,
  gardenCollectionWriteHref,
  type GardenCollectionItem,
  type GardenCollectionRequest,
  type GardenObjectsGroup,
  type GardenSpacesGroup,
} from "@/lib/garden/garden-collection";
import {
  formatGardenCollectionTemplate as template,
  getGardenCollectionCopy,
  type GardenCollectionCopy,
} from "@/lib/garden-collection-copy";
import { resolveIllustrationRole } from "@/lib/illustrations";
import type { InterfaceLocale } from "@/lib/interface-localization";
import type { WorkspaceSection } from "@/server/workspace-failure";
import {
  GardenItemRow,
  GardenItemRows,
} from "@/components/garden/garden-item-row";
import { loadGardenGroupPortion } from "@/app/(default)/garden/garden-portion-actions";
import { ShowMoreList } from "@/components/ui/show-more-list";
import { getShowMoreCopy } from "@/lib/show-more";

export { GardenItemRow };

/**
 * The actions My garden exists for, first and by name (`OVE-489`): write,
 * add a plant or an animal, add a space. Each is its own route (the IA keeps
 * setup and editors off the home), so a returning gardener never scrolls past
 * a form to reach one (OG-UX-006).
 */
export function GardenActions({ locale }: { locale: InterfaceLocale }) {
  const copy = getGardenCollectionCopy(locale).actions;
  return (
    <nav
      aria-label={copy.label}
      data-garden-actions="true"
      className="flex flex-wrap items-center gap-2"
    >
      <Link
        href="/garden/new"
        data-garden-action="new-entry"
        className={buttonVariants()}
      >
        <NotePencilIcon aria-hidden="true" />
        {copy.newEntry}
      </Link>
      <Link
        href="/garden/objects/new"
        data-garden-action="add-object"
        data-garden-new-object="true"
        className={buttonVariants({ variant: "secondary" })}
      >
        <PlusIcon aria-hidden="true" />
        {copy.addObject}
      </Link>
      <Link
        href="/garden/spaces/new"
        data-garden-action="add-space"
        data-garden-new-space="true"
        className={buttonVariants({ variant: "secondary" })}
      >
        <PlusIcon aria-hidden="true" />
        {copy.addSpace}
      </Link>
    </nav>
  );
}

/**
 * A garden with nothing in it yet (ADR-0035 D1): the picture, one sentence of
 * what a garden is made of, and exactly two ways to start — a space, or a
 * plant or animal. Nothing is created for the gardener, and there is no form
 * on this page.
 */
export function GardenSetup({ locale }: { locale: InterfaceLocale }) {
  const copy = getGardenCollectionCopy(locale).setup;
  return (
    <EmptyState
      data-garden-setup="true"
      illustration={resolveIllustrationRole("first-garden")}
      title={copy.title}
      description={copy.body}
      className="rounded-lg border border-border"
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Link
            href="/garden/spaces/new"
            data-garden-setup-action="add-space"
            data-garden-new-space="true"
            className={buttonVariants()}
          >
            {copy.addSpace}
          </Link>
          <Link
            href="/garden/objects/new"
            data-garden-setup-action="add-object"
            data-garden-new-object="true"
            className={buttonVariants({ variant: "secondary" })}
          >
            {copy.addObject}
          </Link>
        </div>
      }
    />
  );
}

type SpacesSection = WorkspaceSection<GardenSpacesGroup>;
type ObjectsSection = WorkspaceSection<GardenObjectsGroup>;

function readyValue<T>(section: WorkspaceSection<T>): T | null {
  return section.status === "ready" ? section.value : null;
}

/**
 * The collection itself: one search over spaces and plants or animals, two
 * orders with a real rule each, the two groups — each settled on its own — and
 * pages that keep the query (`OVE-489`). Every control is a link or a GET
 * form, so a view works before the bundle and survives reload and Back.
 */
export function GardenCollection({
  locale,
  request,
  today,
  spaces,
  objects,
  simple,
}: {
  locale: InterfaceLocale;
  request: GardenCollectionRequest;
  today: string;
  spaces: SpacesSection;
  objects: ObjectsSection;
  /** Small enough to read whole: no search, orders or modes. */
  simple: boolean;
}) {
  const copy = getGardenCollectionCopy(locale);
  const spacesValue = readyValue(spaces);
  const objectsValue = readyValue(objects);
  const searching = request.q !== "";
  const showSpaces = request.kind !== "object";
  const showObjects = request.kind !== "space";
  // Nothing matched anywhere that could be read. A failed group is never
  // counted as empty: "nothing found" needs every shown group to have said so.
  const nothingFound =
    searching &&
    (!showSpaces || spacesValue?.total === 0) &&
    (!showObjects || objectsValue?.total === 0);

  return (
    <div
      id="garden-collection"
      data-garden-collection="true"
      data-garden-collection-simple={simple ? "true" : undefined}
      className="grid min-w-0 scroll-mt-20 gap-8"
    >
      {simple ? null : (
        <GardenCollectionFilters
          copy={copy}
          request={request}
          spaces={spacesValue}
          objects={objectsValue}
        />
      )}
      <CollectionSummary
        copy={copy}
        searching={searching}
        spaces={showSpaces ? spacesValue : null}
        objects={showObjects ? objectsValue : null}
        simple={simple}
      />

      {nothingFound ? (
        <NoResults copy={copy} request={request} />
      ) : (
        <>
          {showSpaces ? (
            <SpacesGroup
              copy={copy}
              locale={locale}
              request={request}
              section={spaces}
              today={today}
            />
          ) : null}
          {showObjects ? (
            <ObjectsGroup
              copy={copy}
              locale={locale}
              request={request}
              section={objects}
              today={today}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function GardenCollectionFilters({
  copy,
  request,
  spaces,
  objects,
}: {
  copy: GardenCollectionCopy;
  request: GardenCollectionRequest;
  spaces: GardenSpacesGroup | null;
  objects: GardenObjectsGroup | null;
}) {
  const counts = {
    space: spaces?.total,
    object: objects?.total,
    all: spaces && objects ? spaces.total + objects.total : undefined,
  };
  return (
    <FilterBar
      action="/garden"
      facets={[]}
      search={
        <div className="flex items-end gap-2">
          <Field
            label={copy.search.label}
            id="garden-collection-search"
            className="min-w-0 flex-1"
          >
            <SearchInput
              name="q"
              defaultValue={request.q}
              maxLength={GARDEN_COLLECTION_QUERY_LIMIT}
              placeholder={copy.search.placeholder}
              autoComplete="off"
              data-garden-search="true"
            />
          </Field>
          <Button type="submit" variant="secondary" className="shrink-0">
            <MagnifyingGlassIcon aria-hidden="true" />
            {copy.search.submit}
          </Button>
        </div>
      }
      modes={(["all", "object", "space"] as const).map((kind) => ({
        label: copy.modes[kind],
        href: gardenCollectionHref(request, { kind, page: 1 }, ""),
        current: request.kind === kind,
        // A nought is omitted, not printed (DESIGN.md §5.10).
        countLabel: counts[kind] ? String(counts[kind]) : undefined,
      }))}
      sort={{
        key: "sort",
        value: request.sort,
        defaultValue: "recent",
        options: [
          { value: "recent", label: copy.sort.recent },
          { value: "name", label: copy.sort.name },
        ],
      }}
      hidden={request.kind === "all" ? {} : { kind: request.kind }}
      chips={
        request.q
          ? [
              {
                key: "q",
                label: template(copy.search.chip, { query: request.q }),
                removeHref: gardenCollectionHref(
                  request,
                  { q: "", page: 1 },
                  "",
                ),
                removeLabel: template(copy.search.removeChip, {
                  query: request.q,
                }),
              },
            ]
          : []
      }
      clearAllHref="/garden"
      labels={{
        filters: copy.search.label,
        openFilters: copy.search.label,
        sheetDescription: copy.search.label,
        apply: copy.search.submit,
        close: copy.search.clear,
        clear: copy.search.clear,
        clearAll: copy.search.clear,
        activeFilters: copy.search.label,
        sort: copy.sort.label,
        modes: copy.modes.label,
        pending: copy.search.pending,
      }}
    />
  );
}

/**
 * The counts, said once and announced: a search that changes them is heard,
 * not only seen. A group that could not be read is left out of the sentence
 * rather than counted as nought.
 */
function CollectionSummary({
  copy,
  searching,
  spaces,
  objects,
  simple,
}: {
  copy: GardenCollectionCopy;
  searching: boolean;
  spaces: GardenSpacesGroup | null;
  objects: GardenObjectsGroup | null;
  simple: boolean;
}) {
  // A group with nothing to count is left out, as a failed one is: a nought
  // is the absence of a fact, not a fact (DESIGN.md §5.10).
  const parts = [
    spaces?.total
      ? template(copy.summary.spaces, { count: spaces.total })
      : null,
    objects?.total
      ? template(copy.summary.objects, { count: objects.total })
      : null,
  ].filter((part): part is string => part !== null);
  return (
    <p
      role="status"
      data-garden-collection-summary="true"
      className={
        simple ? "sr-only" : "-mt-4 text-body-sm text-text-muted tabular-nums"
      }
    >
      {parts.length > 0
        ? `${searching ? copy.summary.found : copy.summary.all} — ${parts.join(", ")}`
        : null}
    </p>
  );
}

function NoResults({
  copy,
  request,
}: {
  copy: GardenCollectionCopy;
  request: GardenCollectionRequest;
}) {
  return (
    <Section
      id="garden-no-results"
      title={template(copy.search.chip, { query: request.q })}
      className="scroll-mt-20"
    >
      <EmptyState
        variant="no-results"
        data-garden-no-results="true"
        title={copy.noResults.title}
        description={copy.noResults.body}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              href={gardenCollectionHref(request, { q: "", page: 1 }, "")}
              className={buttonVariants({ variant: "secondary" })}
            >
              {copy.noResults.clear}
            </Link>
            {/* Not finding it is often the moment to add it (FAST_ENTRY.md:
                an explicit create action, separate from "No results"). */}
            <Link
              href="/garden/objects/new"
              data-garden-new-object="true"
              className={buttonVariants({ variant: "secondary" })}
            >
              <PlusIcon aria-hidden="true" />
              {copy.noResults.addObject}
            </Link>
          </div>
        }
      />
    </Section>
  );
}

function GroupTitle({ title, count }: { title: string; count?: number }) {
  if (typeof count !== "number") return <>{title}</>;
  // The space is in the title's own text. A margin draws a gap and adds none,
  // and a `{" "}` after text is written after React's `<!-- -->`, where
  // Chromium drops it from the heading's name: Orca read "Простори3"
  // (`OVE-478`).
  return (
    <>
      {`${title} `}
      <span className="ml-1 align-middle text-body-sm font-normal text-text-muted tabular-nums">
        {count}
      </span>
    </>
  );
}

function SpacesGroup({
  copy,
  locale,
  request,
  section,
  today,
}: {
  copy: GardenCollectionCopy;
  locale: InterfaceLocale;
  request: GardenCollectionRequest;
  section: SpacesSection;
  today: string;
}) {
  if (section.status === "error") {
    return (
      <WorkspaceSectionError
        id="garden-spaces"
        locale={locale}
        title={copy.groups.spacesError}
        failure={section}
        retryHref={gardenCollectionHref(request, {}, "garden-spaces")}
      />
    );
  }
  const group = section.value;
  // In a search, a group with nothing to show steps aside for the one that
  // does; out of one, an owner with no spaces yet has no use for the heading.
  if (group.items.length === 0 && request.kind !== "space") return null;

  const pages = Math.max(
    1,
    Math.ceil(group.total / GARDEN_COLLECTION_PAGE_SIZE),
  );
  const preview = request.kind === "all";
  return (
    <Section
      id="garden-spaces"
      data-garden-collection-group="space"
      title={<GroupTitle title={copy.groups.spaces} count={group.total} />}
      className="scroll-mt-20"
      actions={
        preview && group.total > GARDEN_SPACES_PREVIEW_SIZE ? (
          <Link
            href={gardenCollectionHref(request, { kind: "space", page: 1 }, "")}
            data-garden-all-spaces="true"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            {template(copy.groups.allSpaces, { count: group.total })}
          </Link>
        ) : null
      }
    >
      {group.items.length > 0 ? (
        <GroupList
          kind="space"
          locale={locale}
          request={request}
          today={today}
          items={group.items}
          more={!preview && request.page < pages}
        />
      ) : (
        <p className="text-body-sm text-text-muted">{copy.emptyGroup.spaces}</p>
      )}
    </Section>
  );
}

function ObjectsGroup({
  copy,
  locale,
  request,
  section,
  today,
}: {
  copy: GardenCollectionCopy;
  locale: InterfaceLocale;
  request: GardenCollectionRequest;
  section: ObjectsSection;
  today: string;
}) {
  if (section.status === "error") {
    return (
      <WorkspaceSectionError
        id="garden-objects"
        locale={locale}
        title={copy.groups.objectsError}
        failure={section}
        retryHref={gardenCollectionHref(request, {}, "garden-objects")}
      />
    );
  }
  const group = section.value;
  if (group.total === 0 && request.q) return null;

  const pages = Math.max(
    1,
    Math.ceil(group.total / GARDEN_COLLECTION_PAGE_SIZE),
  );
  return (
    <Section
      id="garden-objects"
      data-garden-collection-group="object"
      title={<GroupTitle title={copy.groups.objects} count={group.total} />}
      className="scroll-mt-20"
    >
      {group.items.length > 0 ? (
        <GroupList
          kind="object"
          locale={locale}
          request={request}
          today={today}
          items={group.items}
          more={request.page < pages}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-body-sm text-text-muted">
            {copy.emptyGroup.objects}
          </p>
          <Link
            href="/garden/objects/new"
            data-garden-new-object="true"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            <PlusIcon aria-hidden="true" />
            {copy.actions.addObject}
          </Link>
        </div>
      )}
    </Section>
  );
}

/**
 * A group's rows read in portions (DESIGN.md §5.26): this page's portion, then
 * «Показати ще» to the next page of the same view.
 */
function GroupList({
  kind,
  locale,
  request,
  today,
  items,
  more,
}: {
  kind: "space" | "object";
  locale: InterfaceLocale;
  request: GardenCollectionRequest;
  today: string;
  items: GardenCollectionItem[];
  more: boolean;
}) {
  return (
    <ShowMoreList
      as="ul"
      className="grid"
      data-garden-collection-list={kind}
      copy={getShowMoreCopy(locale)}
      next={
        more
          ? {
              token: String(request.page + 1),
              href: gardenCollectionHref(request, { page: request.page + 1 }),
            }
          : null
      }
      load={loadGardenGroupPortion.bind(null, {
        locale,
        kind,
        q: request.q,
        sort: request.sort,
        spaceId: null,
      })}
    >
      <GardenItemRows
        items={items}
        locale={locale}
        today={today}
        writeHrefFor={(item) => gardenCollectionWriteHref(item, request)}
      />
    </ShowMoreList>
  );
}
