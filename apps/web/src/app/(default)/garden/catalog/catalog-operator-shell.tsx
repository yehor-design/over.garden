import Link from "next/link";
import type { ReactNode } from "react";

import { WorkspaceShell } from "@/components/garden/workspace-state";
import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getOperatorCopy } from "@/lib/operator-copy";
import { getOperatorMenuCopy } from "@/lib/operator-menu-copy";

/**
 * The shell both curation surfaces render before anything is read
 * (ADR-0023): the page is on screen, then a section settles inside it.
 */
export function CatalogOperatorShell({
  locale,
  surface,
  accessState,
  title,
  description,
  state,
  children,
}: {
  locale: InterfaceLocale;
  surface: "catalog-queue" | "catalog-sources";
  /** The published state attribute this surface's proofs read by name. */
  accessState: "sign-in-required" | "denied" | "unavailable" | "allowed";
  title: string;
  description: string;
  state?: "loading";
  children: ReactNode;
}) {
  const operatorCopy = getOperatorCopy(locale);
  const menuCopy = getOperatorMenuCopy(locale);

  return (
    <div data-operator-surface={surface} data-operator-access-state={accessState}>
      <WorkspaceShell
        surface={surface}
        locale={locale}
        state={state}
        width="wide"
        title={title}
        description={description}
        navigation={
          <div className="flex flex-wrap gap-2">
            <Link href="/garden" className={buttonVariants({ variant: "outline" })}>
              {operatorCopy.common.backToJournal}
            </Link>
            <Link
              href={
                surface === "catalog-queue"
                  ? "/garden/catalog/sources"
                  : "/garden/catalog/queue"
              }
              className={buttonVariants({ variant: "outline" })}
            >
              {surface === "catalog-queue"
                ? menuCopy.links["catalog-sources"]
                : menuCopy.links["catalog-queue"]}
            </Link>
          </div>
        }
      >
        {children}
      </WorkspaceShell>
    </div>
  );
}
