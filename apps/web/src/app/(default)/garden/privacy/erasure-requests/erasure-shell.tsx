import Link from "next/link";
import type { ReactNode } from "react";

import { WorkspaceShell } from "@/components/garden/workspace-state";
import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getOperatorCopy } from "@/lib/operator-copy";
import { getOperatorErasureCopy } from "@/lib/operator-erasure-copy";

export function ErasureRequestsShell({
  locale,
  state,
  accessState,
  children,
}: {
  locale: InterfaceLocale;
  state?: "loading";
  /** The published state attribute this surface's proofs read by name. */
  accessState: "sign-in-required" | "denied" | "unavailable" | "allowed";
  children: ReactNode;
}) {
  const operatorCopy = getOperatorCopy(locale);
  const copy = getOperatorErasureCopy(locale);

  return (
    <div
      data-operator-surface="erasure-requests"
      data-operator-access-state={accessState}
    >
      <WorkspaceShell
        surface="erasure-requests"
        locale={locale}
        state={state}
        width="wide"
        title={copy.title}
        description={copy.description}
        navigation={
          <Link
            href="/garden"
            className={buttonVariants({ variant: "outline" })}
          >
            {operatorCopy.common.backToJournal}
          </Link>
        }
      >
        {children}
      </WorkspaceShell>
    </div>
  );
}
