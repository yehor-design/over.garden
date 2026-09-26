import { randomUUID } from "node:crypto";

import type { Metadata, Viewport } from "next";
import { connection } from "next/server";

import { SpaceSetupFlow } from "@/components/garden/space-setup-flow";
import { WorkspaceSectionError } from "@/components/garden/workspace-state";
import { normalizeSpaceSetupReturnTo } from "@/lib/garden/space-setup";
import { getSpaceSetupCopy } from "@/lib/space-setup-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { createSpaceFormAction } from "./actions";
import { GARDEN_SPACE_SETUP_PATH, SpaceSetupShell } from "./space-setup-shell";

/**
 * The stepper keeps its primary button above a phone's keyboard: with
 * `resizes-content` the keyboard shrinks the layout viewport the frame fills
 * (DESIGN.md §5.24).
 */
export const viewport: Viewport = { interactiveWidget: "resizes-content" };

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestInterfaceLocale();
  return {
    title: `${getSpaceSetupCopy(locale).title} | OverGarden`,
    robots: { index: false, follow: false },
  };
}

/**
 * Create a space (`OVE-484`, `OVE-523`): the full-screen stepper — name, an
 * optional photo, «Створити». Reached from My garden and from object setup;
 * `returnTo` hands the new space's id back to the caller.
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
  // The intent's id, made per render; the tab keeps the first one it saw.
  await connection();
  return (
    <SpaceSetupFlow
      locale={locale}
      requestId={randomUUID()}
      returnTo={returnTo}
      formAction={createSpaceFormAction}
    />
  );
}
