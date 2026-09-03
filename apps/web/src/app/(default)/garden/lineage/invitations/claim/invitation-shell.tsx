import Link from "next/link";
import type { ReactNode } from "react";

import { WorkspaceShell } from "@/components/garden/workspace-state";
import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getOwnerLineageCopy } from "@/lib/owner-lineage-copy";

export function LineageInvitationClaimShell({
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
      surface="lineage-invitation-claim"
      locale={locale}
      state={state}
      width="narrow"
      title={copy.invitation.title}
      description={copy.invitation.description}
      navigation={
        <Link href="/garden" className={buttonVariants({ variant: "outline" })}>
          {copy.common.backToJournal}
        </Link>
      }
    >
      {children}
    </WorkspaceShell>
  );
}
