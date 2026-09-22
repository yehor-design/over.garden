import type { Metadata } from "next";

import { SpaceSetupFlow } from "@/components/garden/space-setup-flow";
import { WorkspaceSectionError } from "@/components/garden/workspace-state";
import { normalizeSpaceSetupReturnTo } from "@/lib/garden/space-setup";
import { getSpaceSetupCopy } from "@/lib/space-setup-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { GARDEN_SPACE_SETUP_PATH, SpaceSetupShell } from "./space-setup-shell";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestInterfaceLocale();
  return {
    title: `${getSpaceSetupCopy(locale).title} | OverGarden`,
    robots: { index: false, follow: false },
  };
}

/**
 * Create a space on its own (`OVE-484`). Reached from My garden and from
 * object setup; `returnTo` hands the new space's id back to the caller. The
 * composer's nested create uses the same flow in `propose` mode and writes
 * nothing until Publish.
 */
export default async function GardenSpaceSetupPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [viewer, params, locale] = await Promise.all([
    resolveWorkspaceViewer(),
    searchParams ??
      Promise.resolve({} as Record<string, string | string[] | undefined>),
    getRequestInterfaceLocale(),
  ]);
  const rawReturnTo = Array.isArray(params.returnTo)
    ? params.returnTo[0]
    : params.returnTo;
  const returnTo = rawReturnTo
    ? normalizeSpaceSetupReturnTo(rawReturnTo)
    : null;

  if (viewer.status === "unavailable") {
    return (
      <SpaceSetupShell locale={locale}>
        <WorkspaceSectionError
          locale={locale}
          failure={viewer.failure}
          retryHref={GARDEN_SPACE_SETUP_PATH}
        />
      </SpaceSetupShell>
    );
  }
  if (viewer.status === "sign-in-required") {
    return (
      <SpaceSetupShell locale={locale}>
        <SignInPrompt locale={locale} next={GARDEN_SPACE_SETUP_PATH} />
      </SpaceSetupShell>
    );
  }
  return (
    <SpaceSetupShell locale={locale}>
      <SpaceSetupFlow locale={locale} mode="create" returnTo={returnTo} />
    </SpaceSetupShell>
  );
}
