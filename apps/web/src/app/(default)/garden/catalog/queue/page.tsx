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
import { Button, buttonVariants } from "@/components/ui/button";
import { publicCatalogEvidencePath } from "@/lib/garden/public-paths";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  getOperatorCatalogCopy,
  type OperatorCatalogCopy,
} from "@/lib/operator-catalog-copy";
import {
  formatOperatorDate,
  formatOperatorTemplate,
  getOperatorCopy,
} from "@/lib/operator-copy";
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
import { CATALOG_QUEUE_KEYS } from "./shortcut-keys";
import {
  acceptCatalogQueueItemAction,
  rejectCatalogQueueItemAction,
  revertCatalogActionAction,
  skipCatalogQueueItemAction,
} from "./actions";
import { HiddenField } from "@/components/ui/hidden-field";

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
      <p className="rounded-lg border border-border p-4 text-body-sm text-text-muted">
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
  const queueHref = (itemId: string | null, confirm?: "merge") => {
    const params = new URLSearchParams();
    if (itemType) params.set("type", itemType);
    if (itemId) params.set("item", itemId);
    if (confirm) params.set("confirm", confirm);
    const query = params.toString();
    return query ? `${CATALOG_QUEUE_PATH}?${query}` : CATALOG_QUEUE_PATH;
  };
  const previousItem = currentIndex > 0 ? (items[currentIndex - 1] ?? null) : null;
  const nextItem = items[currentIndex + 1] ?? null;

  return (
    <section className="grid gap-6" data-catalog-queue="true">
      <div className="flex flex-wrap gap-2 text-caption text-text-muted">
        <span className="rounded-md border border-border px-2 py-1">
          {copy.queue.open}: {counts.total}
        </span>
        <Link
          href={CATALOG_QUEUE_PATH}
          className={`rounded-md border px-2 py-1 ${itemType === null ? "border-action text-text" : "border-border"}`}
        >
          {copy.queue.filterAll}
        </Link>
        {ITEM_TYPES.map((type) => (
          <Link
            key={type}
            href={`${CATALOG_QUEUE_PATH}?type=${type}`}
            data-catalog-queue-filter={type}
            className={`rounded-md border px-2 py-1 ${itemType === type ? "border-action text-text" : "border-border"}`}
          >
            {copy.queue.itemTypes[type]} ({counts.byType[type] ?? 0})
          </Link>
        ))}
      </div>

      {current === null ? (
        <p
          data-catalog-queue-empty="true"
          className="rounded-lg border border-dashed border-border p-4 text-body-sm text-text-muted"
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
            queueHref={queueHref}
            /* A confirmation is granted for **one** item. The link used to
               drop `type` and `item`, so confirming a merge on the fifth
               card re-rendered the first one with the confirmation already
               granted — and the Accept form then carried the first card's id.
               A merge over fifty gardener objects was applied to whatever
               happened to be at the top (`OVE-459` AC3). The id now travels
               with the grant, and a grant that does not name this item is no
               grant: an item decided in another tab falls back to the
               highest-impact one, which must not inherit it. */
            confirmMerge={confirmMerge && requestedItemId === current.id}
          />
          <nav
            className="flex flex-wrap items-center gap-2 text-caption text-text-muted"
            data-catalog-queue-nav-bar="true"
          >
            {previousItem ? (
              <Link
                href={queueHref(previousItem.id)}
                data-catalog-queue-nav="previous"
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                {copy.queue.previousItem}
              </Link>
            ) : null}
            {nextItem ? (
              <Link
                href={queueHref(nextItem.id)}
                data-catalog-queue-nav="next"
                className={buttonVariants({ variant: "secondary", size: "sm" })}
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
  queueHref,
  confirmMerge,
}: {
  locale: InterfaceLocale;
  copy: OperatorCatalogCopy;
  item: CurationQueueItem;
  canMutate: boolean;
  queueHref: (itemId: string | null, confirm?: "merge") => string;
  confirmMerge: boolean;
}) {
  const mergeObjectCount = item.subject?.objectCount ?? 0;
  const needsConfirmation =
    item.itemType === "node_merge" &&
    mergeObjectCount > MERGE_CONFIRMATION_OBJECT_THRESHOLD;

  return (
    <article
      data-catalog-queue-item={item.id}
      data-catalog-queue-item-type={item.itemType}
      className="grid gap-4 rounded-lg border border-border p-4"
    >
      <div className="flex flex-wrap items-center gap-2 text-caption text-text-muted">
        <span className="rounded-md border border-border px-2 py-1 text-text">
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

      <p className="text-body-sm text-text-muted">
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
              {/* The count, not the threshold. "More than fifty" is the rule;
                  what the owner is deciding about is *this* many gardeners'
                  objects (`OVE-459` AC3). */}
              <p
                className="w-full text-body-sm text-text-muted"
                data-catalog-queue-confirm-objects={mergeObjectCount}
              >
                {formatOperatorTemplate(copy.queue.confirmMergeHint, {
                  count: mergeObjectCount,
                })}
              </p>
              <Link
                href={queueHref(item.id, "merge")}
                className={buttonVariants({ variant: "secondary" })}
                data-catalog-queue-action="confirm"
              >
                {copy.queue.confirmMerge}
              </Link>
            </>
          ) : (
            <OwnerScopedProgressiveForm action={acceptCatalogQueueItemAction}>
              <HiddenField name="queueItemId" value={item.id} />
              {item.itemType === "node_merge" && item.subject ? (
                <HiddenField
                  name="mergeSubjectCatalogItemId"
                  value={item.subject.catalogItemId}
                />
              ) : null}
              {confirmMerge ? (
                <HiddenField name="confirmMerge" value="yes" />
              ) : null}
              <Button type="submit" data-catalog-queue-action="accept">
                {copy.queue.accept}
              </Button>
            </OwnerScopedProgressiveForm>
          )}
          <OwnerScopedProgressiveForm action={rejectCatalogQueueItemAction}>
            <HiddenField name="queueItemId" value={item.id} />
            <Button
              type="submit"
              variant="secondary"
              data-catalog-queue-action="reject"
            >
              {copy.queue.reject}
            </Button>
          </OwnerScopedProgressiveForm>
          <OwnerScopedProgressiveForm action={skipCatalogQueueItemAction}>
            <HiddenField name="queueItemId" value={item.id} />
            <Button
              type="submit"
              variant="secondary"
              data-catalog-queue-action="skip"
            >
              {copy.queue.skip}
            </Button>
          </OwnerScopedProgressiveForm>
          <QueueKeyLegend copy={copy} />
          <CatalogQueueShortcuts />
        </div>
      ) : null}

      <p className="text-caption text-text-muted">
        {formatOperatorDate(locale, item.createdAt)}
      </p>
    </article>
  );
}

/**
 * The keys, printed from the array that binds them (`OVE-459` AC2).
 *
 * It was one sentence — "Клавіші: Y — так, N — ні, J — наступне…" — which is
 * documentation wearing the page's clothes. A `<kbd>` against its action is
 * read as a key by a screen reader and found at a glance by everyone else.
 */
function QueueKeyLegend({ copy }: { copy: OperatorCatalogCopy }) {
  return (
    <section className="w-full grid gap-1" data-catalog-queue-keys="true">
      <h3 className="text-overline text-text-muted">
        {copy.queue.keyboardHint}
      </h3>
      <dl className="flex flex-wrap gap-x-4 gap-y-1">
        {CATALOG_QUEUE_KEYS.map((shortcut) => (
          <div key={shortcut.key} className="flex items-center gap-1.5">
            <dt>
              <kbd
                data-catalog-queue-key={shortcut.key}
                className="rounded-sm border border-border-control px-1.5 py-0.5 font-mono text-caption text-text uppercase"
              >
                {shortcut.key}
              </kbd>
            </dt>
            <dd className="text-caption text-text-muted">
              {copy.queue.keys[shortcut.target]}
            </dd>
          </div>
        ))}
      </dl>
    </section>
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
      <p className="text-caption font-medium text-text-muted">{heading}</p>
      {label ? (
        <>
          <p className="text-h4 font-semibold text-text">{label}</p>
          <p className="text-caption text-text-muted">
            {copy.queue.label} · {labelObjectCount} {copy.queue.objects}
          </p>
        </>
      ) : null}
      {node ? (
        <>
          <p className="text-h4 font-semibold text-text">
            {node.canonicalName}
          </p>
          <p className="text-caption text-text-muted">
            {node.nodeKind}
            {node.rank ? ` · ${node.rank}` : ""}
            {node.kingdom ? ` · ${node.kingdom}` : ""}
          </p>
          <p className="text-caption text-text-muted">
            {node.objectCount} {copy.queue.objects} · {node.entryCount}{" "}
            {copy.queue.entries}
          </p>
          {node.identifiers.length > 0 ? (
            <p className="text-caption text-text-muted">
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
              className="text-caption text-text-link underline-offset-4 hover:underline"
            >
              {node.publicSlug}
            </Link>
          ) : null}
        </>
      ) : label ? null : (
        <p className="text-body-sm text-text-muted">—</p>
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
        <h2 className="text-h4 font-semibold text-text">
          {copy.queue.automatic}
        </h2>
        <p className="text-body-sm text-text-muted">
          {copy.queue.automaticHint}
        </p>
      </div>
      {actions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-body-sm text-text-muted">
          {copy.queue.automaticEmpty}
        </p>
      ) : (
        <ol className="grid gap-2">
          {actions.map((action) => (
            <li
              key={action.actionId}
              data-catalog-automatic-action={action.actionId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-body-sm"
            >
              <span className="text-text">
                {action.itemType
                  ? copy.queue.itemTypes[
                      action.itemType as keyof OperatorCatalogCopy["queue"]["itemTypes"]
                    ] ?? action.actionType
                  : action.actionType}
                {action.subjectNames.length > 0
                  ? `: ${action.subjectNames.join(" → ")}`
                  : ""}
              </span>
              <span className="text-caption text-text-muted">
                {copy.queue.appliedAt}: {formatOperatorDate(locale, action.performedAt)}
                {action.ruleCode ? ` · ${action.ruleCode}` : ""}
              </span>
              {action.reverted ? (
                <span className="text-caption text-text-muted">
                  {copy.queue.reverted}
                </span>
              ) : canMutate ? (
                <OwnerScopedProgressiveForm action={revertCatalogActionAction}>
                  <HiddenField name="actionId" value={action.actionId} />
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    data-catalog-automatic-undo={action.actionId}
                  >
                    {copy.queue.undo}
                  </Button>
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
