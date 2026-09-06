import type { Metadata } from "next";
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";

import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import {
  WorkspaceSectionError,
  WorkspaceSectionSkeleton,
  workspaceSchemaMissingHint,
} from "@/components/garden/workspace-state";
import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getOperatorCatalogCopy } from "@/lib/operator-catalog-copy";
import { formatOperatorDate, getOperatorCopy } from "@/lib/operator-copy";
import {
  assertAdminCapabilityForScope,
  hasAdminCapability,
} from "@/server/admin-access";
import { listCatalogSourceCards } from "@/server/catalog-curation-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  resolveWorkspaceAdminAccess,
  resolveWorkspaceViewer,
} from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";

import { CatalogOperatorShell } from "../catalog-operator-shell";
import { refreshCatalogSourceAction } from "./actions";

export const CATALOG_SOURCES_PATH = "/garden/catalog/sources";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getOperatorCatalogCopy(await getRequestInterfaceLocale());
  return {
    title: copy.sources.metadataTitle,
    robots: { index: false, follow: false },
  };
}

export default async function CatalogSourcesPage() {
  const [locale, viewer] = await Promise.all([
    getRequestInterfaceLocale(),
    resolveWorkspaceViewer(),
  ]);
  const copy = getOperatorCatalogCopy(locale);
  const operatorCopy = getOperatorCopy(locale);
  const shell = (
    accessState: "sign-in-required" | "denied" | "unavailable" | "allowed",
    children: React.ReactNode,
  ) => (
    <CatalogOperatorShell
      locale={locale}
      surface="catalog-sources"
      accessState={accessState}
      title={copy.sources.title}
      description={copy.sources.description}
    >
      {children}
    </CatalogOperatorShell>
  );

  if (viewer.status === "unavailable") {
    return shell(
      "unavailable",
      <WorkspaceSectionError
        locale={locale}
        failure={viewer.failure}
        title={operatorCopy.common.accessDenied}
        retryHref={CATALOG_SOURCES_PATH}
        technicalHint={workspaceSchemaMissingHint(locale, viewer.failure)}
      />,
    );
  }

  if (viewer.status === "sign-in-required") {
    return shell(
      "sign-in-required",
      <SignInPrompt locale={locale} next={CATALOG_SOURCES_PATH} />,
    );
  }

  const access = await resolveWorkspaceAdminAccess(() =>
    assertAdminCapabilityForScope(viewer.scope, "operator:read"),
  );

  if (access.status === "unavailable") {
    return shell(
      "unavailable",
      <WorkspaceSectionError
        locale={locale}
        failure={access.failure}
        title={operatorCopy.common.accessDenied}
        retryHref={CATALOG_SOURCES_PATH}
        technicalHint={workspaceSchemaMissingHint(locale, access.failure)}
      />,
    );
  }

  if (access.status === "denied") {
    return shell(
      "denied",
      <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
        {operatorCopy.common.accessDenied}
      </p>,
    );
  }

  return shell(
    "allowed",
    <Suspense fallback={<WorkspaceSectionSkeleton locale={locale} rows={2} />}>
      <CatalogSourcesSection
        locale={locale}
        canMutate={hasAdminCapability(access.access, "operator:mutate")}
      />
    </Suspense>,
  );
}

async function CatalogSourcesSection({
  locale,
  canMutate,
}: {
  locale: InterfaceLocale;
  canMutate: boolean;
}) {
  const copy = getOperatorCatalogCopy(locale);
  const settled = await settleSection(() => listCatalogSourceCards(), {
    deadlineMs: workspaceSectionDeadlineMs(3),
    surface: "catalog-sources",
    section: "sources",
  });

  if (settled.status === "error") {
    return (
      <WorkspaceSectionError
        locale={locale}
        failure={settled}
        title={copy.sources.title}
        retryHref={CATALOG_SOURCES_PATH}
        technicalHint={workspaceSchemaMissingHint(locale, settled)}
      />
    );
  }

  const sources = settled.value;
  if (sources.length === 0) {
    return (
      <p
        data-catalog-sources-empty="true"
        className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
      >
        {copy.sources.empty}
      </p>
    );
  }

  return (
    <ol className="grid gap-3 md:grid-cols-2" data-catalog-sources="true">
      {sources.map((source) => (
        <li
          key={source.sourceSlug}
          data-catalog-source={source.sourceSlug}
          className="grid gap-2 rounded-lg border border-border p-4"
        >
          <a
            href={source.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-0 items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
          >
            <span className="truncate">{source.sourceName}</span>
            <ExternalLink className="size-3 shrink-0" />
          </a>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border px-2 py-1">
              {copy.sources.version}: {source.sourceVersion}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {copy.sources.license}: {source.license}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {copy.sources.fetchedAt}:{" "}
              {formatOperatorDate(locale, source.fetchedAt)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {source.recordCount} {copy.sources.records} · {source.linkedCount}{" "}
            {copy.sources.linked} · {source.identifierCount}{" "}
            {copy.sources.identifiers} · {source.assertionCount}{" "}
            {copy.sources.assertions}
          </p>
          {source.attributionText ? (
            <p className="text-xs text-muted-foreground">
              {copy.sources.attribution}: {source.attributionText}
            </p>
          ) : null}
          {source.lastRefreshQueuedAt ? (
            <p
              data-catalog-source-refresh-status={source.lastRefreshStatus ?? ""}
              className="text-xs text-muted-foreground"
            >
              {copy.sources.lastRefresh}:{" "}
              {formatOperatorDate(locale, source.lastRefreshQueuedAt)}
              {source.lastRefreshStatus === "pending" ||
              source.lastRefreshStatus === "processing"
                ? ` · ${copy.sources.refreshQueued}`
                : ""}
            </p>
          ) : null}
          {canMutate ? (
            <OwnerScopedProgressiveForm action={refreshCatalogSourceAction}>
              <input type="hidden" name="sourceSlug" value={source.sourceSlug} />
              <button
                type="submit"
                data-catalog-source-refresh={source.sourceSlug}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {copy.sources.refresh}
              </button>
            </OwnerScopedProgressiveForm>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
