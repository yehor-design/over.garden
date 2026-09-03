import type { Metadata } from "next";
import { Suspense } from "react";

import {
  WorkspaceAccessPanel,
  WorkspaceSectionError,
  WorkspaceSectionSkeleton,
  workspaceSchemaMissingHint,
} from "@/components/garden/workspace-state";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getStableRegistryExtensionPackCopy } from "@/lib/operator-curation-copy";
import { isStableRegistryExtensionPacksEnabled } from "@/lib/stable-registry/feature-gate";
import { assertCatalogCuratorAccess } from "@/server/catalog-curator-auth";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { readExtensionPackCenter } from "@/server/stable-registry/extension-pack-repository";
import {
  resolveWorkspaceAdminAccess,
  resolveWorkspaceViewer,
} from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";

import {
  StableRegistryExtensionsShell,
  StableRegistryReturnLink,
  STABLE_REGISTRY_EXTENSIONS_PATH,
} from "../registry-shell";
import {
  abandonExtensionPackAction,
  activateExtensionPackAction,
  approveExtensionPackPreviewAction,
  decideExtensionPackGroupAction,
} from "../extension-actions";
import { StableRegistryExtensionPackLane } from "./extension-pack-lane";

/** The pack read walks the pack, its groups, and the active catalog pointer. */
const EXTENSION_PACK_DEADLINE_MS = workspaceSectionDeadlineMs(4);

export async function generateMetadata(): Promise<Metadata> {
  const copy = getStableRegistryExtensionPackCopy(
    await getRequestInterfaceLocale(),
  );
  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    robots: { index: false, follow: false },
  };
}

export default async function StableRegistryExtensionsPage() {
  const [locale, viewer] = await Promise.all([
    getRequestInterfaceLocale(),
    resolveWorkspaceViewer(),
  ]);
  const copy = getStableRegistryExtensionPackCopy(locale);

  const panel = (
    state: "sign-in-required" | "denied" | "disabled" | "unavailable",
    message: string,
    failure?: Parameters<typeof WorkspaceAccessPanel>[0]["failure"],
  ) => (
    <WorkspaceAccessPanel
      locale={locale}
      surface="stable-registry-extensions"
      stateAttribute="data-extension-pack-state"
      state={state}
      title={copy.title}
      message={message}
      failure={failure}
      retryHref={STABLE_REGISTRY_EXTENSIONS_PATH}
      navigation={
        <StableRegistryReturnLink
          locale={locale}
          label={copy.returnToActiveCatalog}
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
  if (!isStableRegistryExtensionPacksEnabled()) {
    return panel("disabled", copy.disabled);
  }

  return (
    <StableRegistryExtensionsShell locale={locale}>
      <Suspense
        fallback={<WorkspaceSectionSkeleton locale={locale} rows={3} />}
      >
        <ExtensionPackSection locale={locale} />
      </Suspense>
    </StableRegistryExtensionsShell>
  );
}

async function ExtensionPackSection({ locale }: { locale: InterfaceLocale }) {
  const copy = getStableRegistryExtensionPackCopy(locale);
  const model = await settleSection(
    () => readExtensionPackCenter({ writesEnabled: true }),
    { deadlineMs: EXTENSION_PACK_DEADLINE_MS },
  );

  if (model.status === "error") {
    return (
      <WorkspaceSectionError
        locale={locale}
        title={copy.unavailable}
        failure={model}
        retryHref={STABLE_REGISTRY_EXTENSIONS_PATH}
        technicalHint={workspaceSchemaMissingHint(locale, model)}
      />
    );
  }

  return (
    <StableRegistryExtensionPackLane
      locale={locale}
      model={model.value}
      decideAction={decideExtensionPackGroupAction}
      approveAction={approveExtensionPackPreviewAction}
      activateAction={activateExtensionPackAction}
      abandonAction={abandonExtensionPackAction}
    />
  );
}
