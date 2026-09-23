import Link from "next/link";
import type { ReactNode } from "react";

import { WorkspaceShell } from "@/components/garden/workspace-state";
import { buttonVariants } from "@/components/ui/button";
import { gardenSpacePath } from "@/lib/garden/space-page";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getSpacePageCopy } from "@/lib/space-page-copy";

/**
 * The space page's shell (`OVE-490`). Like the object's, its heading is the
 * generic "Простір": the name is data, and the heading is on screen before
 * any read finishes; the name arrives as the first heading below it.
 */
export function SpaceShell({
  locale,
  state,
  children,
}: {
  locale: InterfaceLocale;
  state?: "loading";
  children: ReactNode;
}) {
  const copy = getSpacePageCopy(locale).shell;
  return (
    <WorkspaceShell
      surface="space"
      locale={locale}
      state={state}
      eyebrow={copy.eyebrow}
      title={copy.title}
      navigation={
        <Link
          href="/garden#garden-spaces"
          className={buttonVariants({ variant: "secondary" })}
        >
          {copy.back}
        </Link>
      }
    >
      {children}
    </WorkspaceShell>
  );
}

export function SpaceSettingsShell({
  locale,
  spaceId,
  state,
  children,
}: {
  locale: InterfaceLocale;
  /** Absent while loading: `loading.tsx` is not given the route's params. */
  spaceId?: string | null;
  state?: "loading";
  children: ReactNode;
}) {
  const copy = getSpacePageCopy(locale).shell;
  return (
    <WorkspaceShell
      surface="space-settings"
      locale={locale}
      state={state}
      width="narrow"
      eyebrow={copy.eyebrow}
      title={copy.settingsTitle}
      navigation={
        <Link
          href={spaceId ? gardenSpacePath(spaceId) : "/garden#garden-spaces"}
          className={buttonVariants({ variant: "secondary" })}
        >
          {spaceId ? copy.settingsBack : copy.back}
        </Link>
      }
    >
      {children}
    </WorkspaceShell>
  );
}
