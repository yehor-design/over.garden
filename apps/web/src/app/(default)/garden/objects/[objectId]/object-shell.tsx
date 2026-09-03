import Link from "next/link";
import type { ReactNode } from "react";

import { WorkspaceShell } from "@/components/garden/workspace-state";
import { buttonVariants } from "@/components/ui/button";
import {
  getInterfaceCopy,
  type InterfaceLocale,
} from "@/lib/interface-localization";

export function gardenObjectPath(objectId: string) {
  return `/garden/objects/${encodeURIComponent(objectId)}`;
}

/**
 * The passport shell. Its heading is the generic "living object" rather than
 * the record's own name, because the name is data and the heading has to be on
 * screen before any read finishes; the name arrives with the passport overview
 * immediately below it.
 */
export function ObjectShell({
  locale,
  state,
  children,
}: {
  locale: InterfaceLocale;
  state?: "loading";
  children: ReactNode;
}) {
  const copy = getInterfaceCopy(locale);
  return (
    <WorkspaceShell
      surface="object"
      locale={locale}
      state={state}
      width="wide"
      eyebrow={copy.object.gardenJournal}
      title={copy.object.livingObject}
      navigation={
        <Link href="/garden" className={buttonVariants({ variant: "outline" })}>
          {copy.object.backToJournal}
        </Link>
      }
    >
      {children}
    </WorkspaceShell>
  );
}
