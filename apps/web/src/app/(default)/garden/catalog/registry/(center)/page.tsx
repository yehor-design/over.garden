import type { Metadata } from "next";
import { Suspense } from "react";

import {
  WorkspaceAccessPanel,
  WorkspaceSectionError,
  WorkspaceSectionSkeleton,
  workspaceSchemaMissingHint,
} from "@/components/garden/workspace-state";
import { isStableRegistryReleaseCenterEnabled } from "@/lib/stable-registry/feature-gate";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getStableRegistryCopy } from "@/lib/operator-curation-copy";
import { assertCatalogCuratorAccess } from "@/server/catalog-curator-auth";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  resolveWorkspaceAdminAccess,
  resolveWorkspaceViewer,
} from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";
import { readStableRegistryReleaseCenter } from "@/server/stable-registry/release-repository";

import {
  StableRegistryNavigation,
  StableRegistryShell,
  STABLE_REGISTRY_PATH,
} from "../registry-shell";
import {
  abandonFoundationReleaseAction,
  activateFoundationReleaseAction,
  approveFoundationPreviewAction,
  buildFoundationReleaseAction,
  decideFoundationExceptionGroupAction,
} from "../actions";
import { StableRegistryReleaseCenter } from "../release-center";

/** The release center read walks the release, its exception groups, and the
 * capture aggregate: four round trips at worst. */
const RELEASE_CENTER_DEADLINE_MS = workspaceSectionDeadlineMs(4);

export async function generateMetadata(): Promise<Metadata> {
  const copy = getStableRegistryCopy(await getRequestInterfaceLocale());
  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    robots: { index: false, follow: false },
  };
}

export default async function StableRegistryPage() {
  const [locale, viewer] = await Promise.all([
    getRequestInterfaceLocale(),
    resolveWorkspaceViewer(),
  ]);
  const copy = getStableRegistryCopy(locale);

  const panel = (
    state: "sign-in-required" | "denied" | "disabled" | "unavailable",
    message: string,
    failure?: Parameters<typeof WorkspaceAccessPanel>[0]["failure"],
  ) => (
    <WorkspaceAccessPanel
      locale={locale}
      surface="stable-registry"
      stateAttribute="data-release-center-state"
      state={state}
      title={copy.title}
      message={message}
      failure={failure}
      retryHref={STABLE_REGISTRY_PATH}
      navigation={<StableRegistryNavigation locale={locale} />}
    />
  );

  if (viewer.status === "unavailable") {
    return panel("unavailable", copy.unavailable, viewer.failure);
  }
  if (viewer.status === "sign-in-required") {
    return panel("sign-in-required", copy.signInRequired);
  }

  const access = await resolveWorkspaceAdminAccess(() =>
    assertCatalogCuratorAccess(viewer.scope),
  );
  if (access.status === "unavailable") {
    return panel("unavailable", copy.unavailable, access.failure);
  }
  if (access.status === "denied") {
    return panel("denied", copy.accessDenied);
  }

  const writesEnabled = isStableRegistryReleaseCenterEnabled();
  if (!writesEnabled) {
    return panel("disabled", copy.releaseCenterDisabled);
  }

  return (
    <StableRegistryShell locale={locale}>
      <Suspense
        fallback={<WorkspaceSectionSkeleton locale={locale} rows={3} />}
      >
        <ReleaseCenterSection locale={locale} />
      </Suspense>
    </StableRegistryShell>
  );
}

/**
 * The only read on this page, settled rather than awaited: a missing relation
 * here is the exact incident ADR-0023 was written from, and it has to arrive as
 * a panel naming the relation instead of a skeleton that never resolves.
 */
async function ReleaseCenterSection({ locale }: { locale: InterfaceLocale }) {
  const copy = getStableRegistryCopy(locale);
  const model = await settleSection(
    () => readStableRegistryReleaseCenter({ writesEnabled: true }),
    {
      deadlineMs: RELEASE_CENTER_DEADLINE_MS,
      surface: "stable-registry",
      section: "release-center",
    },
  );

  if (model.status === "error") {
    return (
      <WorkspaceSectionError
        locale={locale}
        title={copy.unavailable}
        failure={model}
        retryHref={STABLE_REGISTRY_PATH}
        technicalHint={workspaceSchemaMissingHint(locale, model)}
      />
    );
  }

  return (
    <StableRegistryReleaseCenter
      locale={locale}
      model={model.value}
      buildAction={buildFoundationReleaseAction}
      decideAction={decideFoundationExceptionGroupAction}
      approveAction={approveFoundationPreviewAction}
      activateAction={activateFoundationReleaseAction}
      abandonAction={abandonFoundationReleaseAction}
    />
  );
}
