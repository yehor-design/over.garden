import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import {
  WorkspaceSectionError,
  WorkspaceSectionSkeleton,
  workspaceSchemaMissingHint,
} from "@/components/garden/workspace-state";
import { buttonVariants } from "@/components/ui/button";
import { publicCatalogEvidencePath } from "@/lib/garden/public-paths";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  getOperatorCatalogCopy,
  type OperatorCatalogCopy,
} from "@/lib/operator-catalog-copy";
import { formatOperatorDate, getOperatorCopy } from "@/lib/operator-copy";
import {
  assertAdminCapabilityForScope,
  hasAdminCapability,
} from "@/server/admin-access";
import {
  countOpenCurationQueue,
  listOpenCurationQueue,
  listRecentAutomaticActions,
  MERGE_CONFIRMATION_OBJECT_THRESHOLD,
  type AppliedCurationAction,
  type CuratedNodeSummary,
  type CurationQueueItem,
} from "@/server/catalog-curation-repository";
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
import { CatalogQueueShortcuts } from "./shortcuts";
import {
  acceptCatalogQueueItemAction,
  rejectCatalogQueueItemAction,
  revertCatalogActionAction,
  skipCatalogQueueItemAction,
} from "./actions";

export const CATALOG_QUEUE_PATH = "/garden/catalog/queue";

const ITEM_TYPES = [
  "label_link",
  "node_merge",
  "source_link",
  "split_review",
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const copy = getOperatorCatalogCopy(await getRequestInterfaceLocale());
  return {
    title: copy.queue.metadataTitle,
    robots: { index: false, follow: false },
  };
}

export default async function CatalogQueuePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const emptyParams: Record<string, string | string[] | undefined> = {};
  const [locale, viewer, query] = await Promise.all([
    getRequestInterfaceLocale(),
    resolveWorkspaceViewer(),
    searchParams ?? Promise.resolve(emptyParams),
  ]);
  const copy = getOperatorCatalogCopy(locale);
  const operatorCopy = getOperatorCopy(locale);
  const shell = (
    accessState: "sign-in-required" | "denied" | "unavailable" | "allowed",
    children: React.ReactNode,
  ) => (
    <CatalogOperatorShell
      locale={locale}
      surface="catalog-queue"
      accessState={accessState}
      title={copy.queue.title}
      description={copy.queue.description}
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
        retryHref={CATALOG_QUEUE_PATH}
        technicalHint={workspaceSchemaMissingHint(locale, viewer.failure)}
      />,
    );
  }

  if (viewer.status === "sign-in-required") {
    return shell(
      "sign-in-required",
      <SignInPrompt locale={locale} next={CATALOG_QUEUE_PATH} />,
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
        retryHref={CATALOG_QUEUE_PATH}
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

  const requestedType = firstParam(query.type);
  const itemType = ITEM_TYPES.find((value) => value === requestedType) ?? null;
  const requestedItemId = firstParam(query.item) ?? null;

  return shell(
    "allowed",
    <Suspense fallback={<WorkspaceSectionSkeleton locale={locale} rows={2} />}>
      <CatalogQueueSection
        locale={locale}
        itemType={itemType}
        requestedItemId={requestedItemId}
        canMutate={hasAdminCapability(access.access, "operator:mutate")}
        confirmMerge={firstParam(query.confirm) === "merge"}
      />
    </Suspense>,
  );
}

async function CatalogQueueSection({
  locale,
  itemType,
  requestedItemId,
  canMutate,
  confirmMerge,
}: {
  locale: InterfaceLocale;
  itemType: string | null;
  requestedItemId: string | null;
  canMutate: boolean;
  confirmMerge: boolean;
}) {
  const copy = getOperatorCatalogCopy(locale);
  const settled = await settleSection(
    async () => {
      const [items, counts, automatic] = await Promise.all([
        listOpenCurationQueue({ itemType, limit: 20 }),
        countOpenCurationQueue(),
        listRecentAutomaticActions({ days: 7, limit: 25 }),
      ]);
      return { items, counts, automatic };
    },
    {
      deadlineMs: workspaceSectionDeadlineMs(3),
      surface: "catalog-queue",
      section: "queue",
    },
  );

  if (settled.status === "error") {
    return (
      <WorkspaceSectionError
        locale={locale}
        failure={settled}
        title={copy.queue.title}
        retryHref={CATALOG_QUEUE_PATH}
        technicalHint={workspaceSchemaMissingHint(locale, settled)}
      />
    );
  }

  const { items, counts, automatic } = settled.value;
  /**
   * One decision at a time (ADR-0026 D10). J and K walk the open stream
   * without deciding anything: they follow the same links a reader without
   * JavaScript clicks, so browsing never records a `skipped` state the owner
   * did not mean. A cursor that no longer exists (its item was decided in
   * another tab) falls back to the highest-impact item rather than an error.
   */
  const requestedIndex = requestedItemId
    ? items.findIndex((item) => item.id === requestedItemId)
    : -1;
  const currentIndex = requestedIndex >= 0 ? requestedIndex : 0;
  const current = items[currentIndex] ?? null;
  const queueHref = (itemId: string | null) => {
    const params = new URLSearchParams();
    if (itemType) params.set("type", itemType);
    if (itemId) params.set("item", itemId);
    const query = params.toString();
    return query ? `${CATALOG_QUEUE_PATH}?${query}` : CATALOG_QUEUE_PATH;
  };
  const previousItem = currentIndex > 0 ? (items[currentIndex - 1] ?? null) : null;
  const nextItem = items[currentIndex + 1] ?? null;

  return (
    <section className="grid gap-6" data-catalog-queue="true">
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded-md border border-border px-2 py-1">
          {copy.queue.open}: {counts.total}
        </span>
        <Link
          href={CATALOG_QUEUE_PATH}
          className={`rounded-md border px-2 py-1 ${itemType === null ? "border-foreground text-foreground" : "border-border"}`}
        >
          {copy.queue.filterAll}
        </Link>
        {ITEM_TYPES.map((type) => (
          <Link
            key={type}
            href={`${CATALOG_QUEUE_PATH}?type=${type}`}
            data-catalog-queue-filter={type}
            className={`rounded-md border px-2 py-1 ${itemType === type ? "border-foreground text-foreground" : "border-border"}`}
          >
            {copy.queue.itemTypes[type]} ({counts.byType[type] ?? 0})
          </Link>
        ))}
      </div>

      {current === null ? (
        <p
          data-catalog-queue-empty="true"
          className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
        >
          {copy.queue.empty}
        </p>
      ) : (
        <>
          <CurrentDecision
            locale={locale}
            copy={copy}
            item={current}
            canMutate={canMutate}
            confirmMerge={confirmMerge}
          />
          <nav
            className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
            data-catalog-queue-nav-bar="true"
          >
            {previousItem ? (
              <Link
                href={queueHref(previousItem.id)}
                data-catalog-queue-nav="previous"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {copy.queue.previousItem}
              </Link>
            ) : null}
            {nextItem ? (
              <Link
                href={queueHref(nextItem.id)}
                data-catalog-queue-nav="next"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {copy.queue.nextItem}
              </Link>
            ) : null}
            <span data-catalog-queue-position="true">
              {copy.queue.position}: {currentIndex + 1}/{items.length}
            </span>
          </nav>
        </>
      )}

      <AutomaticList
        locale={locale}
        copy={copy}
        actions={automatic}
        canMutate={canMutate}
      />
    </section>
  );
}

function CurrentDecision({
  locale,
  copy,
  item,
  canMutate,
  confirmMerge,
}: {
  locale: InterfaceLocale;
  copy: OperatorCatalogCopy;
  item: CurationQueueItem;
  canMutate: boolean;
  confirmMerge: boolean;
}) {
  const needsConfirmation =
    item.itemType === "node_merge" &&
    (item.subject?.objectCount ?? 0) > MERGE_CONFIRMATION_OBJECT_THRESHOLD;

  return (
    <article
      data-catalog-queue-item={item.id}
      data-catalog-queue-item-type={item.itemType}
      className="grid gap-4 rounded-lg border border-border p-4"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-md border border-border px-2 py-1 text-foreground">
          {copy.queue.itemTypes[item.itemType]}
        </span>
        <span className="rounded-md border border-border px-2 py-1">
          {copy.queue.impact}: {item.impactScore}
        </span>
        {item.confidence !== null ? (
          <span className="rounded-md border border-border px-2 py-1">
            {copy.queue.confidence}: {item.confidence.toFixed(2)}
          </span>
        ) : null}
        {item.sourceSlug ? (
          <span className="rounded-md border border-border px-2 py-1">
            {item.sourceSlug}
          </span>
        ) : null}
      </div>

      <p className="text-sm text-muted-foreground">
        {copy.queue.reasons}: {item.reasons.join(", ") || "—"}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <DecisionCard
          copy={copy}
          heading={copy.queue.subject}
          node={item.subject}
          label={item.subjectLabel}
          labelObjectCount={item.labelObjectCount}
        />
        <DecisionCard
          copy={copy}
          heading={copy.queue.target}
          node={item.target}
          label={null}
          labelObjectCount={0}
        />
      </div>

      {canMutate ? (
        <div className="flex flex-wrap gap-2" data-catalog-queue-controls="true">
          {needsConfirmation && !confirmMerge ? (
            <>
              <p className="w-full text-sm text-muted-foreground">
                {copy.queue.confirmMergeHint}
              </p>
              <Link
                href={`${CATALOG_QUEUE_PATH}?confirm=merge`}
                className={buttonVariants({ variant: "outline" })}
                data-catalog-queue-action="confirm"
              >
                {copy.queue.confirmMerge}
              </Link>
            </>
          ) : (
            <OwnerScopedProgressiveForm action={acceptCatalogQueueItemAction}>
              <input type="hidden" name="queueItemId" value={item.id} />
              {item.itemType === "node_merge" && item.subject ? (
                <input
                  type="hidden"
                  name="mergeSubjectCatalogItemId"
                  value={item.subject.catalogItemId}
                />
              ) : null}
              {confirmMerge ? (
                <input type="hidden" name="confirmMerge" value="yes" />
              ) : null}
              <button
                type="submit"
                data-catalog-queue-action="accept"
                className={buttonVariants({})}
              >
                {copy.queue.accept}
              </button>
            </OwnerScopedProgressiveForm>
          )}
          <OwnerScopedProgressiveForm action={rejectCatalogQueueItemAction}>
            <input type="hidden" name="queueItemId" value={item.id} />
            <button
              type="submit"
              data-catalog-queue-action="reject"
              className={buttonVariants({ variant: "outline" })}
            >
              {copy.queue.reject}
            </button>
          </OwnerScopedProgressiveForm>
          <OwnerScopedProgressiveForm action={skipCatalogQueueItemAction}>
            <input type="hidden" name="queueItemId" value={item.id} />
            <button
              type="submit"
              data-catalog-queue-action="skip"
              className={buttonVariants({ variant: "outline" })}
            >
              {copy.queue.skip}
            </button>
          </OwnerScopedProgressiveForm>
          <p className="w-full text-xs text-muted-foreground">
            {copy.queue.keyboardHint}
          </p>
          <CatalogQueueShortcuts />
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {formatOperatorDate(locale, item.createdAt)}
      </p>
    </article>
  );
}

function DecisionCard({
  copy,
  heading,
  node,
  label,
  labelObjectCount,
}: {
  copy: OperatorCatalogCopy;
  heading: string;
  node: CuratedNodeSummary | null;
  label: string | null;
  labelObjectCount: number;
}) {
  return (
    <div className="grid gap-2 rounded-md border border-border p-3">
      <p className="text-xs font-medium text-muted-foreground">{heading}</p>
      {label ? (
        <>
          <p className="text-lg font-semibold text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">
            {copy.queue.label} · {labelObjectCount} {copy.queue.objects}
          </p>
        </>
      ) : null}
      {node ? (
        <>
          <p className="text-lg font-semibold text-foreground">
            {node.canonicalName}
          </p>
          <p className="text-xs text-muted-foreground">
            {node.nodeKind}
            {node.rank ? ` · ${node.rank}` : ""}
            {node.kingdom ? ` · ${node.kingdom}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            {node.objectCount} {copy.queue.objects} · {node.entryCount}{" "}
            {copy.queue.entries}
          </p>
          {node.identifiers.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {copy.queue.identifiers}:{" "}
              {node.identifiers
                .map((identifier) => `${identifier.scheme}:${identifier.value}`)
                .join(", ")}
            </p>
          ) : null}
          {node.publicSlug ? (
            <Link
              href={publicCatalogEvidencePath({
                catalogKind: node.catalogKind as never,
                publicSlug: node.publicSlug,
                speciesSlug: node.speciesSlug,
              })}
              className="text-xs text-primary underline-offset-4 hover:underline"
            >
              {node.publicSlug}
            </Link>
          ) : null}
        </>
      ) : label ? null : (
        <p className="text-sm text-muted-foreground">—</p>
      )}
    </div>
  );
}

function AutomaticList({
  locale,
  copy,
  actions,
  canMutate,
}: {
  locale: InterfaceLocale;
  copy: OperatorCatalogCopy;
  actions: AppliedCurationAction[];
  canMutate: boolean;
}) {
  return (
    <section className="grid gap-3" data-catalog-automatic="true">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          {copy.queue.automatic}
        </h2>
        <p className="text-sm text-muted-foreground">
          {copy.queue.automaticHint}
        </p>
      </div>
      {actions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          {copy.queue.automaticEmpty}
        </p>
      ) : (
        <ol className="grid gap-2">
          {actions.map((action) => (
            <li
              key={action.actionId}
              data-catalog-automatic-action={action.actionId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <span className="text-foreground">
                {action.itemType
                  ? copy.queue.itemTypes[
                      action.itemType as keyof OperatorCatalogCopy["queue"]["itemTypes"]
                    ] ?? action.actionType
                  : action.actionType}
                {action.subjectNames.length > 0
                  ? `: ${action.subjectNames.join(" → ")}`
                  : ""}
              </span>
              <span className="text-xs text-muted-foreground">
                {copy.queue.appliedAt}: {formatOperatorDate(locale, action.performedAt)}
                {action.ruleCode ? ` · ${action.ruleCode}` : ""}
              </span>
              {action.reverted ? (
                <span className="text-xs text-muted-foreground">
                  {copy.queue.reverted}
                </span>
              ) : canMutate ? (
                <OwnerScopedProgressiveForm action={revertCatalogActionAction}>
                  <input type="hidden" name="actionId" value={action.actionId} />
                  <button
                    type="submit"
                    data-catalog-automatic-undo={action.actionId}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    {copy.queue.undo}
                  </button>
                </OwnerScopedProgressiveForm>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
