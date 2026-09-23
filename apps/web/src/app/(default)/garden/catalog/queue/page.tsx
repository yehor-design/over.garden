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
import { ActionOutcomeNotice } from "@/components/ui/action-outcome-notice";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { HiddenField } from "@/components/ui/hidden-field";
import {
  automaticOutcomeFromRecord,
  CURATION_ITEM_TYPES,
  CURATION_OUTCOME_ANCHOR,
  curationItemName,
  curationQueueHref,
  queueOutcomeFromRecord,
  readCurationItemType,
  readCurationOutcome,
  readCurationUuid,
  type CurationItemType,
  type CurationOutcome,
  type CurationResult,
} from "@/lib/catalog/curation-queue";
import { catalogIdentifierSchemeName } from "@/lib/catalog/source-names";
import { publicCatalogEvidencePath } from "@/lib/garden/public-paths";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  countOperatorCatalogUnit,
  getOperatorCatalogCopy,
  type OperatorCatalogCopy,
} from "@/lib/operator-catalog-copy";
import { formatOperatorTemplate } from "@/lib/operator-copy";
import {
  assertAdminCapabilityForScope,
  hasAdminCapability,
} from "@/server/admin-access";
import {
  countOpenCurationQueue,
  listOpenCurationQueue,
  listRecentAutomaticActions,
  MERGE_CONFIRMATION_OBJECT_THRESHOLD,
  readCurationActionSummary,
  readCurationQueueItemSummary,
  readOpenCurationQueueItem,
  type AppliedCurationAction,
  type CuratedNodeSummary,
  type CurationQueueItem,
} from "@/server/catalog-curation-repository";
import { readOldestOpenQueueItemAgeDays } from "@/server/catalog-health-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  resolveWorkspaceAdminAccess,
  resolveWorkspaceViewer,
} from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";

import {
  CatalogOperatorDenied,
  CatalogOperatorShell,
  CatalogOperatorUnavailable,
  CatalogReadAt,
  formatCatalogOperatorDate,
  type CatalogOperatorAccessState,
} from "../catalog-operator-shell";
import { ReasonLine } from "../catalog-reason";
import { WorkTable } from "../catalog-work-table";
import {
  acceptCatalogQueueItemAction,
  rejectCatalogQueueItemAction,
  revertCatalogActionAction,
  skipCatalogQueueItemAction,
} from "./actions";
import { CATALOG_QUEUE_KEYS } from "./shortcut-keys";
import { CatalogQueueShortcuts } from "./shortcuts";

/** How many open decisions the table lists, highest impact first. */
const QUEUE_PAGE_SIZE = 20;

/** Where the decision on screen is, so a row's review link lands on it. */
const DECISION_ANCHOR = "decision";
const AUTOMATIC_OUTCOME_ANCHOR = "automatic-outcome";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getOperatorCatalogCopy(await getRequestInterfaceLocale());
  return {
    title: copy.queue.metadataTitle,
    robots: { index: false, follow: false },
  };
}

/**
 * The owner's decision queue (ADR-0026 D10), rebuilt as a work queue
 * (`OVE-506`): the decision on screen in a detail pane, every open decision
 * in a table beside it — what it is, why, whether it can be accepted and one
 * way into it — and the week's automatic decisions with their undo, each
 * part read and failed on its own.
 */
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
  const itemType = readCurationItemType(query.type);
  const requestedItemId = readCurationUuid(query.item);
  const outcome = readCurationOutcome(query);
  const here = curationQueueHref({ type: itemType, item: requestedItemId });
  const shell = (
    accessState: CatalogOperatorAccessState,
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
      <CatalogOperatorUnavailable
        locale={locale}
        failure={viewer.failure}
        retryHref={here}
      />,
    );
  }

  if (viewer.status === "sign-in-required") {
    return shell(
      "sign-in-required",
      <SignInPrompt locale={locale} next={here} />,
    );
  }

  const access = await resolveWorkspaceAdminAccess(() =>
    assertAdminCapabilityForScope(viewer.scope, "operator:read"),
  );

  if (access.status === "unavailable") {
    return shell(
      "unavailable",
      <CatalogOperatorUnavailable
        locale={locale}
        failure={access.failure}
        retryHref={here}
      />,
    );
  }

  if (access.status === "denied") {
    return shell("denied", <CatalogOperatorDenied locale={locale} />);
  }

  const canMutate = hasAdminCapability(access.access, "operator:mutate");

  return shell(
    "allowed",
    <div className="grid gap-10">
      <Suspense
        fallback={
          <WorkspaceSectionSkeleton
            locale={locale}
            title={copy.queue.decisionHeading}
            rows={3}
            media={false}
          />
        }
      >
        <CatalogQueueSection
          locale={locale}
          itemType={itemType}
          requestedItemId={requestedItemId}
          canMutate={canMutate}
          confirmMerge={firstParam(query.confirm) === "merge"}
          outcome={outcome?.decided ? outcome : null}
        />
      </Suspense>
      {/* The week's automatic decisions settle on their own: a slow audit
          read never holds back the decision on screen, and the reverse. */}
      <Suspense
        fallback={
          <WorkspaceSectionSkeleton
            locale={locale}
            title={copy.automatic.heading}
            rows={2}
            media={false}
          />
        }
      >
        <CatalogAutomaticSection
          locale={locale}
          itemType={itemType}
          currentItemId={requestedItemId}
          canMutate={canMutate}
          outcome={outcome?.action ? outcome : null}
        />
      </Suspense>
    </div>,
  );
}

async function CatalogQueueSection({
  locale,
  itemType,
  requestedItemId,
  canMutate,
  confirmMerge,
  outcome,
}: {
  locale: InterfaceLocale;
  itemType: CurationItemType | null;
  requestedItemId: string | null;
  canMutate: boolean;
  confirmMerge: boolean;
  outcome: CurationOutcome | null;
}) {
  const copy = getOperatorCatalogCopy(locale);
  const settled = await settleSection(
    async () => {
      const [items, counts, oldestAgeDays, decided] = await Promise.all([
        listOpenCurationQueue({ itemType, limit: QUEUE_PAGE_SIZE }),
        countOpenCurationQueue(),
        readOldestOpenQueueItemAgeDays(),
        outcome?.decided
          ? readCurationQueueItemSummary(outcome.decided)
          : Promise.resolve(null),
      ]);
      // A decision asked for by name that is below the listed twenty is read
      // on its own, rather than silently replaced by the top one.
      const requested =
        requestedItemId && !items.some((item) => item.id === requestedItemId)
          ? await readOpenCurationQueueItem(requestedItemId)
          : null;
      return {
        items,
        requested,
        counts,
        oldestAgeDays,
        decided,
        readAt: new Date(),
      };
    },
    {
      deadlineMs: workspaceSectionDeadlineMs(5),
      surface: "catalog-queue",
      section: "queue",
    },
  );

  if (settled.status === "error") {
    return (
      <WorkspaceSectionError
        locale={locale}
        failure={settled}
        title={copy.queue.listHeading}
        retryHref={curationQueueHref({ type: itemType, item: requestedItemId })}
        technicalHint={workspaceSchemaMissingHint(locale, settled)}
      />
    );
  }

  const { items, requested, counts, oldestAgeDays, decided, readAt } =
    settled.value;
  /**
   * One decision at a time (ADR-0026 D10). J and K walk the open stream
   * without deciding anything: they follow the same links a reader without
   * JavaScript clicks, so browsing never records a `skipped` state the owner
   * did not mean. A cursor that no longer exists (its item was decided in
   * another tab) falls back to the highest-impact item rather than an error.
   * A cursor below the listed twenty is shown on its own, outside the walk:
   * Next takes the owner to the top of the list.
   */
  const requestedIndex = requestedItemId
    ? items.findIndex((item) => item.id === requestedItemId)
    : -1;
  const outsideList = requestedIndex < 0 && requested !== null;
  const currentIndex = requestedIndex >= 0 ? requestedIndex : 0;
  const current = outsideList ? requested : (items[currentIndex] ?? null);
  const previousItem =
    !outsideList && currentIndex > 0 ? (items[currentIndex - 1] ?? null) : null;
  const nextItem = outsideList
    ? (items[0] ?? null)
    : (items[currentIndex + 1] ?? null);
  const filteredTotal =
    itemType === null ? counts.total : (counts.byType[itemType] ?? 0);
  // What the notice may say is what the record bears out.
  const noticeResult =
    outcome && decided
      ? queueOutcomeFromRecord(outcome.result, decided.state)
      : null;

  return (
    <section className="grid gap-6" data-catalog-queue="true">
      {noticeResult && decided ? (
        <QueueOutcome
          copy={copy}
          result={noticeResult}
          name={curationItemName(locale, decided)}
          about={`${decided.id}:${decided.state}`}
        />
      ) : null}

      <div className="grid gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p
            className="text-body-sm text-text"
            data-catalog-queue-open={counts.total}
          >
            {formatOperatorTemplate(copy.queue.summary, {
              count: countOperatorCatalogUnit(
                locale,
                counts.total,
                copy.units.decisions,
              ),
            })}
            {oldestAgeDays !== null ? (
              <span
                className="text-text-muted"
                data-catalog-queue-oldest-days={oldestAgeDays}
              >
                {" · "}
                {formatOperatorTemplate(copy.queue.summaryOldest, {
                  age: countOperatorCatalogUnit(
                    locale,
                    oldestAgeDays,
                    copy.units.days,
                  ),
                })}
              </span>
            ) : null}
          </p>
          <CatalogReadAt locale={locale} readAt={readAt} />
        </div>
        <nav aria-label={copy.queue.filterLabel}>
          <ul className="flex flex-wrap gap-2">
            <li>
              <FilterLink
                href={curationQueueHref({})}
                current={itemType === null}
                filter="all"
              >
                {copy.queue.filterAll} ({counts.total})
              </FilterLink>
            </li>
            {CURATION_ITEM_TYPES.map((type) => (
              <li key={type}>
                <FilterLink
                  href={curationQueueHref({ type })}
                  current={itemType === type}
                  filter={type}
                >
                  {copy.queue.itemTypes[type]} ({counts.byType[type] ?? 0})
                </FilterLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {current === null ? (
        <p
          data-catalog-queue-empty="true"
          className="rounded-lg border border-dashed border-border p-4 text-body-sm text-text-muted"
        >
          {itemType !== null && counts.total > 0
            ? copy.queue.emptyFiltered
            : copy.queue.empty}
        </p>
      ) : (
        <>
          <CurrentDecision
            locale={locale}
            copy={copy}
            item={current}
            itemType={itemType}
            nextItemId={nextItem?.id ?? previousItem?.id ?? null}
            canMutate={canMutate}
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
            position={
              outsideList ? null : { index: currentIndex + 1, count: items.length }
            }
            previousHref={
              previousItem
                ? curationQueueHref({
                    type: itemType,
                    item: previousItem.id,
                    hash: DECISION_ANCHOR,
                  })
                : null
            }
            nextHref={
              nextItem
                ? curationQueueHref({
                    type: itemType,
                    item: nextItem.id,
                    hash: DECISION_ANCHOR,
                  })
                : null
            }
          />
          <OpenDecisionsTable
            locale={locale}
            copy={copy}
            items={items}
            currentId={current.id}
            itemType={itemType}
          />
          {filteredTotal > items.length ? (
            <p
              className="text-caption text-text-muted"
              data-catalog-queue-shown={items.length}
            >
              {formatOperatorTemplate(copy.queue.shown, {
                shown: items.length,
                total: filteredTotal,
              })}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function FilterLink({
  href,
  current,
  filter,
  children,
}: {
  href: string;
  current: boolean;
  filter: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      data-catalog-queue-filter={filter}
      className={`inline-flex min-h-10 items-center rounded-md border px-3 text-caption ${
        current
          ? "border-action bg-action-subtle text-text"
          : "border-border text-text-muted hover:text-text"
      }`}
    >
      {children}
    </Link>
  );
}

type DecisionState = "ready" | "confirm" | "blocked";

function decisionState(item: CurationQueueItem): DecisionState {
  if (item.blockedBy) return "blocked";
  const objects = item.subject?.objectCount ?? 0;
  return item.itemType === "node_merge" &&
    objects > MERGE_CONFIRMATION_OBJECT_THRESHOLD
    ? "confirm"
    : "ready";
}

function itemName(locale: InterfaceLocale, item: CurationQueueItem) {
  return curationItemName(locale, {
    itemType: item.itemType,
    subjectLabel: item.subjectLabel,
    subjectName: item.subject?.canonicalName ?? null,
    targetName: item.target?.canonicalName ?? null,
  });
}

function CurrentDecision({
  locale,
  copy,
  item,
  itemType,
  nextItemId,
  canMutate,
  confirmMerge,
  position,
  previousHref,
  nextHref,
}: {
  locale: InterfaceLocale;
  copy: OperatorCatalogCopy;
  item: CurationQueueItem;
  itemType: CurationItemType | null;
  nextItemId: string | null;
  canMutate: boolean;
  confirmMerge: boolean;
  /** Null for a decision shown on its own, below the listed twenty. */
  position: { index: number; count: number } | null;
  previousHref: string | null;
  nextHref: string | null;
}) {
  const state = decisionState(item);
  const mergeObjectCount = item.subject?.objectCount ?? 0;
  const name = itemName(locale, item);
  const cardNode = item.target ?? item.subject;
  const cardHref =
    cardNode?.publicSlug != null
      ? publicCatalogEvidencePath({
          catalogKind: cardNode.catalogKind as never,
          publicSlug: cardNode.publicSlug,
          speciesSlug: cardNode.speciesSlug,
        })
      : null;
  const decisionFields = (
    <>
      <HiddenField name="queueItemId" value={item.id} />
      {itemType ? <HiddenField name="view" value={itemType} /> : null}
      {nextItemId ? <HiddenField name="nextItem" value={nextItemId} /> : null}
    </>
  );

  return (
    <section
      id={DECISION_ANCHOR}
      aria-labelledby="catalog-decision-heading"
      data-catalog-queue-item={item.id}
      data-catalog-queue-item-type={item.itemType}
      data-catalog-queue-state={state}
      data-catalog-queue-blocked={item.blockedBy ?? undefined}
      className="grid scroll-mt-24 gap-5 rounded-lg border border-border p-4 sm:p-5"
    >
      <header className="grid gap-2">
        <p className="text-overline text-text-muted uppercase">
          {copy.queue.decisionHeading} · {copy.queue.itemTypes[item.itemType]}
        </p>
        <h2
          id="catalog-decision-heading"
          className="text-h3 wrap-anywhere text-text-heading"
        >
          {name}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-caption text-text-muted">
          <StateBadge copy={copy} state={state} />
          <span>
            {copy.queue.impact}: {item.impactScore}
          </span>
          {item.confidence !== null ? (
            <span data-catalog-queue-confidence={item.confidence}>
              {copy.queue.confidence}: {Math.round(item.confidence * 100)}%
            </span>
          ) : null}
          {item.sourceSlug ? (
            <span className="wrap-anywhere">{item.sourceSlug}</span>
          ) : null}
          <span>
            {formatOperatorTemplate(copy.queue.createdAt, {
              date: formatCatalogOperatorDate(locale, item.createdAt),
            })}
          </span>
        </div>
      </header>

      <div className="grid gap-2">
        <h3 className="text-caption font-medium text-text-muted">
          {copy.queue.reasons}
        </h3>
        {item.reasons.length > 0 ? (
          <ul className="grid gap-2 text-body-sm">
            {item.reasons.map((code) => (
              <li key={code}>
                <ReasonLine locale={locale} copy={copy} code={code} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-sm text-text-muted">—</p>
        )}
      </div>

      {/* The two sides of the decision, by what kind it is: a gardener's
          label and the card it would join; the card a merge folds away and
          the one it folds into; a source and the card it would vouch for.
          A split has one side — the card under review. */}
      <div
        className={
          item.itemType === "split_review"
            ? "grid gap-3"
            : "grid gap-3 sm:grid-cols-2"
        }
      >
        <DecisionCard
          locale={locale}
          copy={copy}
          heading={copy.queue.subject}
          node={
            item.itemType === "node_merge" || item.itemType === "split_review"
              ? item.subject
              : null
          }
          label={
            item.itemType === "label_link"
              ? item.subjectLabel
              : item.itemType === "source_link"
                ? item.sourceSlug
                : null
          }
          labelCaption={
            item.itemType === "source_link"
              ? copy.queue.itemTypes.source_link
              : `${copy.queue.label} · ${countOperatorCatalogUnit(
                  locale,
                  item.labelObjectCount,
                  copy.units.objects,
                )}`
          }
        />
        {item.itemType === "split_review" ? null : (
          <DecisionCard
            locale={locale}
            copy={copy}
            heading={copy.queue.target}
            node={
              item.itemType === "node_merge"
                ? item.target
                : (item.target ?? item.subject)
            }
            label={null}
            labelCaption=""
          />
        )}
      </div>

      {item.blockedBy ? (
        <Callout tone="warning" title={copy.queue.states.blocked}>
          <p data-catalog-queue-blocked-reason={item.blockedBy}>
            {copy.queue.blocked[item.blockedBy]}
          </p>
          {item.blockedBy === "not_applied_here" && cardHref ? (
            <Link
              href={cardHref}
              className="text-link mt-2 inline-flex min-h-10 items-center font-medium underline-offset-4 hover:underline"
            >
              {copy.queue.openCard}
            </Link>
          ) : null}
        </Callout>
      ) : null}

      {canMutate ? (
        <div className="grid gap-4" data-catalog-queue-controls="true">
          {state === "confirm" && !confirmMerge ? (
            /* The count, not the threshold. "More than fifty" is the rule;
               what the owner is deciding about is *this* many gardeners'
               objects (`OVE-459` AC3). */
            <p
              className="text-body-sm text-text"
              data-catalog-queue-confirm-objects={mergeObjectCount}
            >
              {formatOperatorTemplate(copy.queue.confirmMergeHint, {
                objects: countOperatorCatalogUnit(
                  locale,
                  mergeObjectCount,
                  copy.units.objects,
                ),
              })}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {state === "blocked" ? null : state === "confirm" &&
              !confirmMerge ? (
              <Link
                href={curationQueueHref({
                  type: itemType,
                  item: item.id,
                  confirm: true,
                  hash: DECISION_ANCHOR,
                })}
                className={buttonVariants({ variant: "primary" })}
                data-catalog-queue-action="confirm"
              >
                {copy.queue.confirmMerge}
              </Link>
            ) : (
              <OwnerScopedProgressiveForm action={acceptCatalogQueueItemAction}>
                {decisionFields}
                {confirmMerge ? (
                  <HiddenField name="confirmMerge" value="yes" />
                ) : null}
                <Button type="submit" data-catalog-queue-action="accept">
                  {copy.queue.accept}
                </Button>
              </OwnerScopedProgressiveForm>
            )}
            <OwnerScopedProgressiveForm action={rejectCatalogQueueItemAction}>
              {decisionFields}
              <Button
                type="submit"
                variant="secondary"
                data-catalog-queue-action="reject"
              >
                {copy.queue.reject}
              </Button>
            </OwnerScopedProgressiveForm>
            <OwnerScopedProgressiveForm action={skipCatalogQueueItemAction}>
              {decisionFields}
              <Button
                type="submit"
                variant="secondary"
                data-catalog-queue-action="skip"
              >
                {copy.queue.skip}
              </Button>
            </OwnerScopedProgressiveForm>
          </div>
          <QueueKeyLegend copy={copy} />
        </div>
      ) : null}

      <nav
        className="flex flex-wrap items-center gap-2 border-t border-border pt-4 text-caption text-text-muted"
        data-catalog-queue-nav-bar="true"
        aria-label={copy.queue.listHeading}
      >
        {previousHref ? (
          <Link
            href={previousHref}
            data-catalog-queue-nav="previous"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            {copy.queue.previousItem}
          </Link>
        ) : null}
        {nextHref ? (
          <Link
            href={nextHref}
            data-catalog-queue-nav="next"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            {copy.queue.nextItem}
          </Link>
        ) : null}
        {position ? (
          <span data-catalog-queue-position="true">
            {formatOperatorTemplate(copy.queue.position, position)}
          </span>
        ) : null}
      </nav>
    </section>
  );
}

function StateBadge({
  copy,
  state,
}: {
  copy: OperatorCatalogCopy;
  state: DecisionState;
}) {
  return (
    <Badge
      tone={state === "ready" ? "success" : "warning"}
      data-catalog-queue-state-label={state}
    >
      {copy.queue.states[state]}
    </Badge>
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
    <section className="grid gap-2" data-catalog-queue-keys="true">
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
      <CatalogQueueShortcuts
        labels={{
          on: copy.queue.shortcutsOn,
          off: copy.queue.shortcutsOff,
          turnOn: copy.queue.shortcutsTurnOn,
          turnOff: copy.queue.shortcutsTurnOff,
        }}
      />
    </section>
  );
}

function DecisionCard({
  locale,
  copy,
  heading,
  node,
  label,
  labelCaption,
}: {
  locale: InterfaceLocale;
  copy: OperatorCatalogCopy;
  heading: string;
  node: CuratedNodeSummary | null;
  label: string | null;
  labelCaption: string;
}) {
  return (
    <div className="grid min-w-0 content-start gap-2 rounded-md border border-border p-3">
      <p className="text-caption font-medium text-text-muted">{heading}</p>
      {label ? (
        <>
          <p className="text-h4 font-semibold wrap-anywhere text-text">
            {label}
          </p>
          <p className="text-caption text-text-muted">{labelCaption}</p>
        </>
      ) : null}
      {node ? (
        <>
          <p className="text-h4 font-semibold wrap-anywhere text-text">
            {node.canonicalName}
          </p>
          <p className="text-caption text-text-muted">
            {node.nodeKind}
            {node.rank ? ` · ${node.rank}` : ""}
            {node.kingdom ? ` · ${node.kingdom}` : ""}
          </p>
          <p className="text-caption text-text-muted">
            {countOperatorCatalogUnit(
              locale,
              node.objectCount,
              copy.units.objects,
            )}{" "}
            ·{" "}
            {countOperatorCatalogUnit(
              locale,
              node.entryCount,
              copy.units.entries,
            )}
          </p>
          {node.identifiers.length > 0 ? (
            <div className="grid gap-1">
              <p className="text-caption text-text-muted">
                {copy.queue.identifiers}
              </p>
              <ul className="grid gap-0.5">
                {node.identifiers.map((identifier) => (
                  <li
                    key={`${identifier.scheme}:${identifier.value}`}
                    className="font-mono text-caption wrap-anywhere text-text"
                  >
                    {catalogIdentifierSchemeName(identifier.scheme, locale)}:{" "}
                    {identifier.value}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {node.publicSlug ? (
            <Link
              href={publicCatalogEvidencePath({
                catalogKind: node.catalogKind as never,
                publicSlug: node.publicSlug,
                speciesSlug: node.speciesSlug,
              })}
              className="text-caption wrap-anywhere text-text-link underline-offset-4 hover:underline"
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

function OpenDecisionsTable({
  locale,
  copy,
  items,
  currentId,
  itemType,
}: {
  locale: InterfaceLocale;
  copy: OperatorCatalogCopy;
  items: CurationQueueItem[];
  currentId: string;
  itemType: CurationItemType | null;
}) {
  return (
    <section className="grid gap-3" aria-labelledby="catalog-open-heading">
      <h2 id="catalog-open-heading" className="text-h4 font-semibold text-text">
        {copy.queue.listHeading}
      </h2>
      <WorkTable
        caption={copy.queue.listCaption}
        data-catalog-queue-table="true"
        columns={[
          {
            key: "identity",
            header: copy.queue.columns.identity,
            primary: true,
          },
          { key: "reason", header: copy.queue.columns.reason },
          { key: "state", header: copy.queue.columns.state },
          { key: "impact", header: copy.queue.columns.impact, numeric: true },
          { key: "action", header: copy.queue.columns.action },
        ]}
        rows={items.map((item) => {
          const name = itemName(locale, item);
          const state = decisionState(item);
          const current = item.id === currentId;
          const firstReason = item.reasons[0] ?? null;
          return {
            key: item.id,
            current,
            attributes: {
              "data-catalog-queue-row": item.id,
              "data-catalog-queue-row-state": state,
            },
            cells: {
              identity: (
                <span className="grid gap-0.5">
                  <span className="font-medium text-text">{name}</span>
                  <span className="text-caption text-text-muted">
                    {copy.queue.itemTypes[item.itemType]}
                  </span>
                </span>
              ),
              reason: firstReason ? (
                <ReasonLine
                  locale={locale}
                  copy={copy}
                  code={firstReason}
                  showCode={false}
                />
              ) : (
                "—"
              ),
              state: <StateBadge copy={copy} state={state} />,
              impact: <span className="tabular-nums">{item.impactScore}</span>,
              action: current ? (
                <span className="text-caption text-text-muted">
                  {copy.queue.reviewing}
                </span>
              ) : (
                <Link
                  href={curationQueueHref({
                    type: itemType,
                    item: item.id,
                    hash: DECISION_ANCHOR,
                  })}
                  aria-label={formatOperatorTemplate(copy.queue.reviewLabel, {
                    name,
                  })}
                  data-catalog-queue-review={item.id}
                  className={buttonVariants({
                    variant: "secondary",
                    size: "sm",
                  })}
                >
                  {copy.queue.review}
                </Link>
              ),
            },
          };
        })}
      />
    </section>
  );
}

function QueueOutcome({
  copy,
  result,
  name,
  about,
}: {
  copy: OperatorCatalogCopy;
  result: CurationResult;
  name: string;
  about: string;
}) {
  const tone =
    result === "accepted" || result === "rejected" || result === "skipped"
      ? "success"
      : result === "stale" || result === "reverted" || result === "confirm"
        ? "info"
        : "danger";
  return (
    <div id={CURATION_OUTCOME_ANCHOR} className="scroll-mt-24">
      <ActionOutcomeNotice
        outcome={result}
        about={about}
        tone={tone}
        title={formatOperatorTemplate(copy.queue.outcome[result], { name })}
      />
    </div>
  );
}

async function CatalogAutomaticSection({
  locale,
  itemType,
  currentItemId,
  canMutate,
  outcome,
}: {
  locale: InterfaceLocale;
  itemType: CurationItemType | null;
  currentItemId: string | null;
  canMutate: boolean;
  outcome: CurationOutcome | null;
}) {
  const copy = getOperatorCatalogCopy(locale);
  const settled = await settleSection(
    async () => {
      const [actions, undone] = await Promise.all([
        listRecentAutomaticActions({ days: 7, limit: 25 }),
        outcome?.action
          ? readCurationActionSummary(outcome.action)
          : Promise.resolve(null),
      ]);
      return { actions, undone, readAt: new Date() };
    },
    {
      deadlineMs: workspaceSectionDeadlineMs(2),
      surface: "catalog-queue",
      section: "automatic",
    },
  );

  const heading = (
    <div className="grid gap-1">
      <h2
        id="catalog-automatic-heading"
        className="text-h3 font-semibold tracking-tight text-text"
      >
        {copy.automatic.heading}
      </h2>
      <p className="text-body-sm text-text-muted">{copy.automatic.hint}</p>
    </div>
  );

  if (settled.status === "error") {
    return (
      <section
        className="grid gap-3"
        aria-labelledby="catalog-automatic-heading"
      >
        {heading}
        {/* The heading above names the part; the panel says what happened
            to it, rather than repeating the name. */}
        <WorkspaceSectionError
          locale={locale}
          failure={settled}
          retryHref={curationQueueHref({ type: itemType, item: currentItemId })}
          technicalHint={workspaceSchemaMissingHint(locale, settled)}
        />
      </section>
    );
  }

  const { actions, undone, readAt } = settled.value;
  const undoneResult =
    outcome && undone
      ? automaticOutcomeFromRecord(outcome.result, undone.reverted)
      : null;

  return (
    <section
      className="grid gap-3"
      data-catalog-automatic="true"
      aria-labelledby="catalog-automatic-heading"
    >
      {heading}
      <CatalogReadAt locale={locale} readAt={readAt} />
      {undoneResult && undone ? (
        <div id={AUTOMATIC_OUTCOME_ANCHOR} className="scroll-mt-24">
          <ActionOutcomeNotice
            outcome={undoneResult}
            about={`${undone.actionId}:${undone.reverted ? "reverted" : "applied"}`}
            tone={
              undoneResult === "reverted"
                ? "success"
                : undoneResult === "stale"
                  ? "info"
                  : "danger"
            }
            title={formatOperatorTemplate(copy.queue.outcome[undoneResult], {
              name: undone.subjectNames.join(" → ") || "—",
            })}
          />
        </div>
      ) : null}
      {actions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-body-sm text-text-muted">
          {copy.automatic.empty}
        </p>
      ) : (
        <AutomaticTable
          locale={locale}
          copy={copy}
          actions={actions}
          itemType={itemType}
          currentItemId={currentItemId}
          canMutate={canMutate}
        />
      )}
    </section>
  );
}

function AutomaticTable({
  locale,
  copy,
  actions,
  itemType,
  currentItemId,
  canMutate,
}: {
  locale: InterfaceLocale;
  copy: OperatorCatalogCopy;
  actions: AppliedCurationAction[];
  itemType: CurationItemType | null;
  currentItemId: string | null;
  canMutate: boolean;
}) {
  return (
    <WorkTable
      caption={copy.automatic.caption}
      data-catalog-automatic-table="true"
      columns={[
        { key: "what", header: copy.automatic.columns.what, primary: true },
        { key: "rule", header: copy.automatic.columns.rule },
        { key: "when", header: copy.automatic.columns.when },
        { key: "state", header: copy.automatic.columns.state },
        { key: "action", header: copy.automatic.columns.action },
      ]}
      rows={actions.map((action) => {
        const typeName =
          action.itemType &&
          (CURATION_ITEM_TYPES as readonly string[]).includes(action.itemType)
            ? copy.queue.itemTypes[action.itemType as CurationItemType]
            : action.actionType;
        const subjects = action.subjectNames.join(" → ") || "—";
        return {
          key: action.actionId,
          attributes: { "data-catalog-automatic-action": action.actionId },
          cells: {
            what: (
              <span className="grid gap-0.5">
                <span className="font-medium text-text">{subjects}</span>
                <span className="text-caption text-text-muted">{typeName}</span>
              </span>
            ),
            rule: action.ruleCode ? (
              <ReasonLine
                locale={locale}
                copy={copy}
                code={action.ruleCode}
                showCode={false}
              />
            ) : (
              "—"
            ),
            when: formatCatalogOperatorDate(locale, action.performedAt, {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            }),
            state: (
              <Badge
                tone={action.reverted ? "neutral" : "success"}
                data-catalog-automatic-state={
                  action.reverted ? "reverted" : "applied"
                }
              >
                {action.reverted
                  ? copy.automatic.reverted
                  : copy.automatic.applied}
              </Badge>
            ),
            action:
              !action.reverted && canMutate ? (
                <OwnerScopedProgressiveForm action={revertCatalogActionAction}>
                  <HiddenField name="actionId" value={action.actionId} />
                  {itemType ? (
                    <HiddenField name="view" value={itemType} />
                  ) : null}
                  {currentItemId ? (
                    <HiddenField name="item" value={currentItemId} />
                  ) : null}
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    aria-label={formatOperatorTemplate(
                      copy.automatic.undoLabel,
                      {
                        name: subjects,
                      },
                    )}
                    data-catalog-automatic-undo={action.actionId}
                  >
                    {copy.automatic.undo}
                  </Button>
                </OwnerScopedProgressiveForm>
              ) : (
                "—"
              ),
          },
        };
      })}
    />
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
