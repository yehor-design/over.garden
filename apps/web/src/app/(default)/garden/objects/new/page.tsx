import type { Metadata } from "next";

import { ObjectSetupFlow } from "@/components/garden/object-setup-flow";
import { WorkspaceSectionError } from "@/components/garden/workspace-state";
import {
  isObjectSetupUuid,
  normalizeObjectSetupReturnTo,
} from "@/lib/garden/object-setup";
import { getObjectSetupCopy } from "@/lib/object-setup-copy";
import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { readOwnedSpaceSummary } from "@/server/object-setup-repository";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";
import {
  GARDEN_OBJECT_SETUP_PATH,
  ObjectSetupShell,
} from "./object-setup-shell";

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

/**
 * Add a plant or an animal on its own (`OVE-485`). Reached from My garden and
 * from space setup (`?space=<id>`). A species page no longer launches it
 * (`OVE-519`): «Додати в мій сад» is gone, and `?catalog=` with it. The space
 * read is settled (ADR-0023): if it fails, the flow starts without it.
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
  const spaceId = firstParam(params.space);
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

  const space = isObjectSetupUuid(spaceId)
    ? await settleSection(() => readOwnedSpaceSummary(viewer.scope, spaceId), {
        deadlineMs: workspaceSectionDeadlineMs(3),
        surface: "object-setup",
        section: "space",
      })
    : null;

  return (
    <ObjectSetupShell locale={locale}>
      <ObjectSetupFlow
        locale={locale}
        initialSpace={
          space?.status === "ready" && space.value
            ? { id: space.value.id, displayName: space.value.displayName }
            : null
        }
        returnTo={returnTo}
      />
    </ObjectSetupShell>
  );
}
