import type { ReactNode } from "react";

import {
  WorkspaceSectionSkeleton,
  WorkspaceShell,
} from "@/components/garden/workspace-state";
import { Skeleton } from "@/components/ui/skeleton";
import { getGardenCollectionCopy } from "@/lib/garden-collection-copy";
import { getGardenWorkspaceCopy } from "@/lib/garden-workspace-copy";
import {
  getInterfaceCopy,
  type InterfaceLocale,
} from "@/lib/interface-localization";

export const GARDEN_HOME_PATH = "/garden";

/**
 * The workspace home's shell, shared by the page and by `loading.tsx` so the
 * heading is in the same place before and after the data arrives (ADR-0023).
 *
 * The description is the neutral one on purpose. Choosing between "returning"
 * and "empty" needs the inventory count, and a header that waits for a count is
 * the thing this restructure exists to remove; the empty case is still answered
 * below, by the next-action block that streams in with the data.
 */
export function GardenHomeShell({
  locale,
  state,
  children,
}: {
  locale: InterfaceLocale;
  state?: "loading";
  children: ReactNode;
}) {
  const copy = getInterfaceCopy(locale);
  const workspaceCopy = getGardenWorkspaceCopy(locale);

  return (
    <WorkspaceShell
      surface="garden-home"
      locale={locale}
      state={state}
      bleed
      eyebrow={workspaceCopy.workspace.headerEyebrow}
      title={copy.workspace.title}
      description={copy.workspace.returningDescription}
    >
      {children}
    </WorkspaceShell>
  );
}

/**
 * The fallback for the streamed half of the home page (`OVE-489`). It mirrors
 * what arrives — the three actions, then the collection's rows — so nothing
 * above the fold moves when the collection lands.
 */
export function GardenHomeSectionsSkeleton({
  locale,
}: {
  locale: InterfaceLocale;
}) {
  const copy = getGardenCollectionCopy(locale).groups;

  return (
    <div
      data-garden-workspace="loading"
      className="flex flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8"
    >
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-10 w-40" />
      </div>
      <WorkspaceSectionSkeleton locale={locale} title={copy.spaces} rows={1} />
      <WorkspaceSectionSkeleton locale={locale} title={copy.objects} rows={4} />
    </div>
  );
}
