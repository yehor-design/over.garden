import Link from "next/link";
import { CaretRightIcon as ChevronRight } from "@/components/icons/CaretRight";

import {
  gardenObjectSectionPath,
  isObjectId,
  type ObjectSection,
} from "@/lib/garden/object-pages";
import {
  publicLineageObjectPath,
  publicObjectPassportPath,
} from "@/lib/garden/public-paths";
import { getLivingObjectPassportCopy } from "@/lib/living-object-passport";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getOwnerObjectCopy } from "@/lib/owner-object-copy";
import { localizedPath } from "@/lib/public-localization";
import { getPublicAuthorHandle } from "@/server/author-handle-repository";
import {
  getPlantObjectPage,
  type PlantObjectPage,
} from "@/server/journal-repository";
import {
  getObjectProvenancePanel,
  type ObjectProvenancePanel,
} from "@/server/lineage-repository";
import type { RequestScope } from "@/server/request-scope";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";

/**
 * The object and its provenance, read together and settled once: all three
 * pages need both — the passport presentation, the provenance count in the
 * sections, the provenance page itself. A malformed id is a record that is
 * not in this garden, answered before any read.
 */
export function loadOwnedObject(
  scope: RequestScope,
  objectId: string,
  surface = "object",
) {
  return settleSection(
    async () => {
      if (!isObjectId(objectId)) return null;
      const page = await getPlantObjectPage(scope, objectId);
      if (!page) return null;
      const provenancePanel = await getObjectProvenancePanel(scope, objectId);
      return provenancePanel ? { page, provenancePanel } : null;
    },
    {
      deadlineMs: workspaceSectionDeadlineMs(6),
      surface,
      section: "passport",
    },
  );
}

/**
 * The owner's registry handle, settled: every public link hangs from it
 * (ADR-0029 D9). A handle that cannot be read is an absent handle — the case
 * the legacy id path already covers — never a reason the page does not render.
 */
export async function loadOwnerAuthorHandle(
  scope: RequestScope,
  surface = "object",
): Promise<string | null> {
  const settled = await settleSection(
    () => getPublicAuthorHandle(scope.userId),
    {
      deadlineMs: workspaceSectionDeadlineMs(1),
      surface,
      section: "author-handle",
    },
  );
  return settled.status === "ready" ? settled.value : null;
}

export function canResolveCatalogState(value: string) {
  return value === "unknown" || value === "free_text";
}

/**
 * The passport's own address (ADR-0029 D9) when the object has one, or the
 * legacy id path in the locale's route family when it does not.
 */
export function ownPassportPath(
  page: PlantObjectPage,
  objectId: string,
  authorHandle: string | null,
  locale: InterfaceLocale,
) {
  return authorHandle && page.plantObject.public_slug
    ? publicObjectPassportPath(authorHandle, page.plantObject.public_slug)
    : localizedPath(locale, publicLineageObjectPath(objectId));
}

export function getLineageReadbackPath(
  page: PlantObjectPage,
  provenancePanel: ObjectProvenancePanel,
  passportPath: string,
) {
  if (!hasActivePublicEntry(page)) return null;

  const hasConfirmedOwnObjectSource = provenancePanel.edges.some(
    (edge) =>
      edge.sourceKind === "own_object" &&
      edge.consentState === "confirmed" &&
      edge.erasureState === "active",
  );

  return hasConfirmedOwnObjectSource ? passportPath : null;
}

export function hasActivePublicEntry(page: PlantObjectPage) {
  return page.entries.some(
    (entry) =>
      entry.visibility === "public" &&
      entry.lifecycle_state === "active" &&
      entry.public_slug &&
      !entry.public_gone_at,
  );
}

/** The three pages as links, the current one marked. */
export function ObjectSectionsNav({
  locale,
  objectId,
  current,
  provenanceCount,
}: {
  locale: InterfaceLocale;
  objectId: string;
  current: ObjectSection;
  provenanceCount: number;
}) {
  const copy = getOwnerObjectCopy(locale).sections;
  const items: Array<{
    section: ObjectSection;
    label: string;
    count?: number;
  }> = [
    { section: "history", label: copy.history },
    { section: "settings", label: copy.settings },
    {
      section: "provenance",
      label: copy.provenance,
      count: provenanceCount > 0 ? provenanceCount : undefined,
    },
  ];
  return (
    <nav aria-label={copy.label} data-object-sections="true">
      <ul className="flex list-none flex-wrap gap-2">
        {items.map(({ section, label, count }) => {
          const active = section === current;
          return (
            <li key={section}>
              <Link
                href={gardenObjectSectionPath(objectId, section)}
                aria-current={active ? "page" : undefined}
                data-object-section={section}
                className={
                  active
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

/**
 * Who this page is about, on the settings and provenance pages: the garden,
 * the space and the object as a breadcrumb, then its name and kind. The
 * object's name is an `h2` — the shell's heading is the page's one `h1`.
 */
export function ObjectSubpageHeader({
  locale,
  object,
  space,
}: {
  locale: InterfaceLocale;
  object: {
    id: string;
    displayName: string;
    objectKind: string;
    species: string | null;
  };
  space: { id: string; displayName: string };
}) {
  const passportCopy = getLivingObjectPassportCopy(locale);
  const copy = getOwnerObjectCopy(locale).provenance.kinds;
  return (
    <header
      data-object-subpage-header={object.id}
      className="grid min-w-0 gap-2"
    >
      {/* The passport's crumbs, drawn the passport's way: a Phosphor caret
          inside each item after the first. The "›" text items this replaces
          were a second icon family (DESIGN.md §2.8, `OVE-478`). */}
      <nav aria-label={passportCopy.ownerPassport} className="min-w-0">
        <ol className="flex min-w-0 list-none flex-wrap items-center gap-1.5 text-caption text-text-muted">
          {[
            { href: "/garden", label: passportCopy.myGarden },
            {
              href: `/garden/spaces/${encodeURIComponent(space.id)}`,
              label: space.displayName,
            },
            {
              href: gardenObjectSectionPath(object.id),
              label: object.displayName,
            },
          ].map((crumb, index) => (
            <li key={crumb.href} className="flex min-w-0 items-center gap-1.5">
              {index > 0 ? (
                <ChevronRight size={16} className="shrink-0" />
              ) : null}
              <Link
                href={crumb.href}
                className="max-w-52 truncate underline-offset-4 hover:underline"
              >
                {crumb.label}
              </Link>
            </li>
          ))}
        </ol>
      </nav>
      <h2 className="text-h2 break-words text-text-heading">
        {object.displayName}
      </h2>
      <p className="text-body-sm text-text-muted">
        {[
          object.objectKind === "animal" ? copy.animal : copy.plant,
          space.displayName,
          object.species,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </header>
  );
}
