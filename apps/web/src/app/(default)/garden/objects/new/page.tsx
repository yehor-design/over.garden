import { randomUUID } from "node:crypto";

import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { ObjectSetupFlow } from "@/components/garden/object-setup-flow";
import { WorkspaceSectionError } from "@/components/garden/workspace-state";
import {
  isObjectSetupUuid,
  normalizeObjectSetupReturnTo,
} from "@/lib/garden/object-setup";
import { getObjectSetupCopy } from "@/lib/object-setup-copy";
import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { listSpacesForObjectSetup } from "@/server/object-setup-repository";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";
import {
  GARDEN_OBJECT_SETUP_PATH,
  ObjectSetupShell,
} from "./object-setup-shell";

/**
 * The stepper keeps its primary button above a phone's keyboard: with
 * `resizes-content` the keyboard shrinks the layout viewport the frame fills
 * (DESIGN.md §5.24).
 */
export const viewport: Viewport = { interactiveWidget: "resizes-content" };

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestInterfaceLocale();
  return {
    title: `${getObjectSetupCopy(locale).title} | OverGarden`,
    robots: { index: false, follow: false },
  };
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** What the space stepper's `returnTo` names: back here, the new space chosen. */
const FROM_SPACE_SETUP = "space-setup";

/**
 * Add a plant or an animal (`OVE-485`, the stepper of `OVE-524`). Reached from
 * My garden, a space (`?space=<id>`, which skips «Простір»), the composer and
 * the profile. A gardener with no space yet goes to the space stepper first
 * and comes back here with the new space chosen (`?from=space-setup&space=`).
 * The spaces read is settled (ADR-0023): if it fails, the page says so.
 */
export default async function GardenObjectSetupPage({
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
  const spaceParam = firstParam(params.space);
  const fromSpaceSetup = firstParam(params.from) === FROM_SPACE_SETUP;
  const returnTo = normalizeObjectSetupReturnTo(firstParam(params.returnTo));

  if (viewer.status === "unavailable") {
    return (
      <ObjectSetupShell locale={locale}>
        <WorkspaceSectionError
          locale={locale}
          failure={viewer.failure}
          retryHref={GARDEN_OBJECT_SETUP_PATH}
        />
      </ObjectSetupShell>
    );
  }
  if (viewer.status === "sign-in-required") {
    return (
      <ObjectSetupShell locale={locale}>
        <SignInPrompt locale={locale} next={GARDEN_OBJECT_SETUP_PATH} />
      </ObjectSetupShell>
    );
  }

  const spaces = await settleSection(
    () => listSpacesForObjectSetup(viewer.scope),
    {
      deadlineMs: workspaceSectionDeadlineMs(3),
      surface: "object-setup",
      section: "spaces",
    },
  );
  if (spaces.status !== "ready") {
    return (
      <ObjectSetupShell locale={locale}>
        <WorkspaceSectionError
          locale={locale}
          failure={spaces}
          retryHref={GARDEN_OBJECT_SETUP_PATH}
        />
      </ObjectSetupShell>
    );
  }

  // Back from the space stepper here, and the stepper comes back to this step
  // with the new space chosen.
  const hereAfterSpaceSetup = objectSetupHref({
    from: FROM_SPACE_SETUP,
    returnTo,
  });
  const spaceSetupHref = `/garden/spaces/new?${new URLSearchParams({
    returnTo: hereAfterSpaceSetup,
  }).toString()}`;
  if (spaces.value.length === 0) {
    // Nothing to put it in yet: a space first. Coming back still without one
    // means the gardener left the space stepper — they go home, not round.
    redirect(fromSpaceSetup ? (returnTo ?? "/garden") : spaceSetupHref);
  }

  const knownSpace =
    isObjectSetupUuid(spaceParam) &&
    spaces.value.some((space) => space.id === spaceParam.toLowerCase())
      ? spaceParam.toLowerCase()
      : null;

  // The intent's id, made per render; the tab keeps the first one it saw.
  await connection();
  return (
    <ObjectSetupFlow
      locale={locale}
      requestId={randomUUID()}
      spaces={spaces.value}
      initialSpaceId={knownSpace}
      skipSpace={knownSpace !== null && !fromSpaceSetup}
      returnTo={returnTo}
      spaceSetupHref={spaceSetupHref}
    />
  );
}

function objectSetupHref(input: { from: string; returnTo: string | null }) {
  const params = new URLSearchParams({ from: input.from });
  if (input.returnTo) params.set("returnTo", input.returnTo);
  return `${GARDEN_OBJECT_SETUP_PATH}?${params.toString()}`;
}
