import Link from "next/link";
import type { ReactNode } from "react";

import { WorkspaceShell } from "@/components/garden/workspace-state";
import { buttonVariants } from "@/components/ui/button";
import { getGardenWorkspaceCopy } from "@/lib/garden-workspace-copy";
import {
  getInterfaceCopy,
  type InterfaceLocale,
} from "@/lib/interface-localization";

export function gardenEntryEditPath(entryId: string, returnTo: string) {
  return `/garden/entries/${encodeURIComponent(entryId)}/edit?returnTo=${encodeURIComponent(returnTo)}`;
}

/**
 * The edit shell. Its heading is the composer's own, not the entry's title:
 * the title is data, and a composer whose header waits for a read is the shape
 * ADR-0023 removes.
 */
export function JournalEntryEditShell({
  locale,
  state,
  returnTo = "/garden",
  children,
}: {
  locale: InterfaceLocale;
  state?: "loading";
  returnTo?: string;
  children: ReactNode;
}) {
  const copy = getInterfaceCopy(locale);
  const workspaceCopy = getGardenWorkspaceCopy(locale);

  return (
    <WorkspaceShell
      surface="entry-edit"
      locale={locale}
      state={state}
      width="narrow"
      title={workspaceCopy.workspace.entryEdit.title}
      navigation={
        <Link
          href={returnTo}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {copy.object.backToJournal}
        </Link>
      }
    >
      {children}
    </WorkspaceShell>
  );
}
