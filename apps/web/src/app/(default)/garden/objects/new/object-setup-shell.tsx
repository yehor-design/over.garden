import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon as ArrowLeft } from "@/components/icons/ArrowLeft";

import { WorkspaceShell } from "@/components/garden/workspace-state";
import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getObjectSetupCopy } from "@/lib/object-setup-copy";

export const GARDEN_OBJECT_SETUP_PATH = "/garden/objects/new";

/**
 * The object-setup shell, shared by the page, its `loading.tsx` and the
 * signed-out state, so the heading and the way back never move (ADR-0023).
 */
export function ObjectSetupShell({
  locale,
  state,
  children,
}: {
  locale: InterfaceLocale;
  state?: "loading";
  children: ReactNode;
}) {
  const copy = getObjectSetupCopy(locale);
  return (
    <WorkspaceShell
      surface="object-setup"
      locale={locale}
      state={state}
      width="narrow"
      title={copy.title}
      navigation={
        <Link
          href="/garden#inventory"
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
