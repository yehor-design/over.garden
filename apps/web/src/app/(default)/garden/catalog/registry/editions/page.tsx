import type { Metadata } from "next";
import { Suspense } from "react";

import {
  WorkspaceAccessPanel,
  WorkspaceSectionError,
  WorkspaceSectionSkeleton,
  workspaceSchemaMissingHint,
} from "@/components/garden/workspace-state";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getStableRegistryEditionCopy } from "@/lib/operator-curation-copy";
import { isStableRegistryEditionsEnabled } from "@/lib/stable-registry/feature-gate";
import { assertCatalogCuratorAccess } from "@/server/catalog-curator-auth";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { readEditionCenter } from "@/server/stable-registry/edition-repository";
import {
  resolveWorkspaceAdminAccess,
  resolveWorkspaceViewer,
} from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";

import {
  StableRegistryEditionsShell,
  StableRegistryReturnLink,
  STABLE_REGISTRY_EDITIONS_PATH,
} from "../registry-shell";
import {
  approveEditionPreviewAction,
  prepareEditionAction,
  decideEditionDiffGroupAction,
  moveEditionPointerAction,
} from "../edition-actions";
import { StableRegistryEditionLane } from "./edition-lane";

/** The edition read walks the edition, its diff groups, and both pointers. */
const EDITION_CENTER_DEADLINE_MS = workspaceSectionDeadlineMs(4);

export async function generateMetadata(): Promise<Metadata> {
  const copy = getStableRegistryEditionCopy(await getRequestInterfaceLocale());
  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    robots: { index: false, follow: false },
  };
}

export default async function StableRegistryEditionsPage() {
  const [locale, viewer] = await Promise.all([
    getRequestInterfaceLocale(),
    resolveWorkspaceViewer(),
  ]);
  const copy = getStableRegistryEditionCopy(locale);

  const panel = (
    state: "sign-in-required" | "denied" | "disabled" | "unavailable",
    message: string,
    failure?: Parameters<typeof WorkspaceAccessPanel>[0]["failure"],
  ) => (
    <WorkspaceAccessPanel
      locale={locale}
      surface="stable-registry-editions"
      stateAttribute="data-edition-state"
      state={state}
      title={copy.title}
      message={message}
      failure={failure}
      retryHref={STABLE_REGISTRY_EDITIONS_PATH}
      navigation={
        <StableRegistryReturnLink
          locale={locale}
          label={copy.keepCurrentRelease}
        />
      }
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
  if (!isStableRegistryEditionsEnabled()) {
    return panel("disabled", copy.disabled);
  }

  return (
    <StableRegistryEditionsShell locale={locale}>
      <Suspense
        fallback={<WorkspaceSectionSkeleton locale={locale} rows={3} />}
      >
        <EditionCenterSection locale={locale} />
      </Suspense>
    </StableRegistryEditionsShell>
  );
}

async function EditionCenterSection({ locale }: { locale: InterfaceLocale }) {
  const copy = getStableRegistryEditionCopy(locale);
  const model = await settleSection(
    () => readEditionCenter({ writesEnabled: true }),
    { deadlineMs: EDITION_CENTER_DEADLINE_MS },
  );

  if (model.status === "error") {
    return (
      <WorkspaceSectionError
        locale={locale}
        title={copy.unavailable}
        failure={model}
        retryHref={STABLE_REGISTRY_EDITIONS_PATH}
        technicalHint={workspaceSchemaMissingHint(locale, model)}
      />
    );
  }

  return (
    <StableRegistryEditionLane
      locale={locale}
      model={model.value}
      prepareAction={prepareEditionAction}
      decideAction={decideEditionDiffGroupAction}
      approveAction={approveEditionPreviewAction}
      pointerAction={moveEditionPointerAction}
    />
  );
}
