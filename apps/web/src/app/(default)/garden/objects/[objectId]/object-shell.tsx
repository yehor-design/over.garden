import Link from "next/link";
import type { ReactNode } from "react";

import { WorkspaceShell } from "@/components/garden/workspace-state";
import { buttonVariants } from "@/components/ui/button";
import { gardenObjectSectionPath } from "@/lib/garden/object-pages";
import {
  getInterfaceCopy,
  type InterfaceLocale,
} from "@/lib/interface-localization";
import { getOwnerObjectCopy } from "@/lib/owner-object-copy";

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
        <Link
          href="/garden"
          className={buttonVariants({ variant: "secondary" })}
        >
          {copy.object.backToJournal}
        </Link>
      }
    >
      {children}
    </WorkspaceShell>
  );
}

/**
 * The shell of the object's settings and provenance pages (`OVE-491`). The
 * heading names the page; the object's name arrives below it, and the way
 * back is to the object's history, where the gardener came from.
 */
export function ObjectSubpageShell({
  locale,
  section,
  objectId,
  state,
  children,
}: {
  locale: InterfaceLocale;
  section: "settings" | "provenance";
  /** Absent while loading: `loading.tsx` is not given the route's params. */
  objectId?: string | null;
  state?: "loading";
  children: ReactNode;
}) {
  const copy = getInterfaceCopy(locale);
  const ownerCopy = getOwnerObjectCopy(locale);
  return (
    <WorkspaceShell
      surface={section === "settings" ? "object-settings" : "object-provenance"}
      locale={locale}
      state={state}
      width="wide"
      eyebrow={copy.object.livingObject}
      title={
        section === "settings"
          ? ownerCopy.settingsPage.title
          : ownerCopy.provenancePage.title
      }
      navigation={
        <Link
          href={objectId ? gardenObjectSectionPath(objectId) : "/garden"}
          className={buttonVariants({ variant: "secondary" })}
        >
          {objectId
            ? ownerCopy.sections.backToObject
            : copy.object.backToJournal}
        </Link>
      }
    >
      {children}
    </WorkspaceShell>
  );
}
