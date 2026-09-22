import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon as ArrowLeft } from "@/components/icons/ArrowLeft";

import { WorkspaceShell } from "@/components/garden/workspace-state";
import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getSpaceSetupCopy } from "@/lib/space-setup-copy";

export const GARDEN_SPACE_SETUP_PATH = "/garden/spaces/new";

/**
 * The space-setup shell, shared by the page, its `loading.tsx` and the
 * signed-out state, so the heading and the way back never move (ADR-0023).
 */
export function SpaceSetupShell({
  locale,
  state,
  children,
}: {
  locale: InterfaceLocale;
  state?: "loading";
  children: ReactNode;
}) {
  const copy = getSpaceSetupCopy(locale);
  return (
    <WorkspaceShell
      surface="space-setup"
      locale={locale}
      state={state}
      width="narrow"
      title={copy.title}
      navigation={
        <Link
          href="/garden#spaces"
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          <ArrowLeft aria-hidden="true" />
          {copy.back}
        </Link>
      }
    >
      {children}
    </WorkspaceShell>
  );
}
