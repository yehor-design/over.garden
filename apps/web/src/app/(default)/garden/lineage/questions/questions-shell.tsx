import Link from "next/link";
import type { ReactNode } from "react";

import { WorkspaceShell } from "@/components/garden/workspace-state";
import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getOwnerLineageCopy } from "@/lib/owner-lineage-copy";

export const LINEAGE_QUESTIONS_PATH = "/garden/lineage/questions";

export function LineageUpdatesShell({
  locale,
  state,
  children,
}: {
  locale: InterfaceLocale;
  state?: "loading";
  children: ReactNode;
}) {
  const copy = getOwnerLineageCopy(locale);
  return (
    <WorkspaceShell
      surface="lineage-questions"
      locale={locale}
      state={state}
      width="wide"
      title={copy.updates.title}
      navigation={
        <>
          <Link
            href="/garden"
            className={buttonVariants({ variant: "outline" })}
          >
            {copy.common.backToJournal}
          </Link>
          <Link
            href="/garden/lineage/claims"
            className={buttonVariants({ variant: "outline" })}
          >
            {copy.common.claims}
          </Link>
        </>
      }
    >
      {children}
    </WorkspaceShell>
  );
}
