import type { Metadata } from "next";

import { ObjectSetupFlow } from "@/components/garden/object-setup-flow";
import { WorkspaceSectionError } from "@/components/garden/workspace-state";
import {
  isObjectSetupUuid,
  normalizeObjectSetupReturnTo,
} from "@/lib/garden/object-setup";
import { getObjectSetupCopy } from "@/lib/object-setup-copy";
import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  listOwnedObjectsForCatalogItem,
  readObjectSetupCatalogPrefill,
  readOwnedSpaceSummary,
} from "@/server/object-setup-repository";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";
import {
  GARDEN_OBJECT_SETUP_PATH,
  ObjectSetupShell,
} from "./object-setup-shell";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestInterfaceLocale();
  return {
    title: `${getObjectSetupCopy(locale).title} | OverGarden`,
    robots: { index: false, follow: false },
  };
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** A catalogue organism's public slug or id, bounded; anything else is none. */
function catalogParam(value: string | undefined) {
  if (!value || value.length > 200) return null;
  return /^[a-z0-9-]+$/iu.test(value) ? value : null;
}

/**
 * Add a plant or an animal on its own (`OVE-485`). Reached from My garden,
 * from an organism's card (`?catalog=<id>`, which first offers the gardener's
 * own objects of that organism) and from space setup (`?space=<id>`). Every
 * read is settled (ADR-0023): a catalogue or space read that fails only means
 * the flow starts without that answer filled in.
 */
export default async function GardenObjectSetupPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [viewer, params, locale] = await Promise.all([
    resolveWorkspaceViewer(),
    searchParams ??
      Promise.resolve({} as Record<string, string | string[] | undefined>),
    getRequestInterfaceLocale(),
  ]);
  const catalogItemId = firstParam(params.catalog);
  const spaceId = firstParam(params.space);
  const returnTo = normalizeObjectSetupReturnTo(firstParam(params.returnTo));
  const next = catalogItemId
    ? `${GARDEN_OBJECT_SETUP_PATH}?catalog=${encodeURIComponent(catalogItemId)}`
    : GARDEN_OBJECT_SETUP_PATH;

  if (viewer.status === "unavailable") {
    return (
      <ObjectSetupShell locale={locale}>
        <WorkspaceSectionError
          locale={locale}
          failure={viewer.failure}
          retryHref={next}
        />
      </ObjectSetupShell>
    );
  }
  if (viewer.status === "sign-in-required") {
    return (
      <ObjectSetupShell locale={locale}>
        <SignInPrompt locale={locale} next={next} />
      </ObjectSetupShell>
    );
  }

  const deadlineMs = workspaceSectionDeadlineMs(3);
  const catalog = catalogParam(catalogItemId);
  const [prefill, space] = await Promise.all([
    catalog
      ? settleSection(() => readObjectSetupCatalogPrefill(catalog, locale), {
          deadlineMs,
          surface: "object-setup",
          section: "catalog-prefill",
        })
      : null,
    isObjectSetupUuid(spaceId)
      ? settleSection(() => readOwnedSpaceSummary(viewer.scope, spaceId), {
          deadlineMs,
          surface: "object-setup",
          section: "space",
        })
      : null,
  ]);
  const organism = prefill?.status === "ready" ? prefill.value : null;
  // The gardener's own objects of this organism come first (criterion 4).
  const matches = organism
    ? await settleSection(
        () =>
          listOwnedObjectsForCatalogItem(viewer.scope, organism.selection.id),
        { deadlineMs, surface: "object-setup", section: "owned-matches" },
      )
    : null;

  return (
    <ObjectSetupShell locale={locale}>
      <ObjectSetupFlow
        locale={locale}
        initialSelection={organism?.selection ?? null}
        initialObjectKind={organism?.objectKind ?? "plant"}
        initialSpace={
          space?.status === "ready" && space.value
            ? { id: space.value.id, displayName: space.value.displayName }
            : null
        }
        matches={organism && matches?.status === "ready" ? matches.value : []}
        returnTo={returnTo}
      />
    </ObjectSetupShell>
  );
}
