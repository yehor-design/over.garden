import type { ReactNode } from "react";

import { WorkspaceShell } from "@/components/garden/workspace-state";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getEntryComposerCopy } from "@/lib/entry-composer-copy";

export const GARDEN_ENTRY_COMPOSER_PATH = "/garden/new";

/**
 * The composer page's shell, shared by the page, its `loading.tsx` and the
 * signed-out state, so the heading never moves (ADR-0023). It carries no
 * navigation of its own: the composer's Close returns to where it was opened.
 */
export function EntryComposerShell({
  locale,
  state,
  children,
}: {
  locale: InterfaceLocale;
  state?: "loading";
  children: ReactNode;
}) {
  return (
    <WorkspaceShell
      surface="entry-composer"
      locale={locale}
      state={state}
      width="narrow"
      title={getEntryComposerCopy(locale).title}
    >
      {children}
    </WorkspaceShell>
  );
}
