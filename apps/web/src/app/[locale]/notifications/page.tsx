import { BellIcon as Bell } from "@/components/icons/Bell";
import { ChatCircleIcon as ChatCircle } from "@/components/icons/ChatCircle";
import { ChecksIcon as CheckCheck } from "@/components/icons/Checks";
import { CaretDownIcon as ChevronDown } from "@/components/icons/CaretDown";
import { EyeSlashIcon as EyeOff } from "@/components/icons/EyeSlash";
import { EnvelopeOpenIcon as MailOpen } from "@/components/icons/EnvelopeOpen";
import { GitBranchIcon as GitBranch } from "@/components/icons/GitBranch";
import { NotePencilIcon as NotePencil } from "@/components/icons/NotePencil";
import { PawPrintIcon as PawPrint } from "@/components/icons/PawPrint";
import { PlantIcon as Plant } from "@/components/icons/Plant";
import { QuestionIcon as Question } from "@/components/icons/Question";
import { SlidersIcon as Settings2 } from "@/components/icons/Sliders";
import { UserPlusIcon as UserPlus } from "@/components/icons/UserPlus";
import type { InterfaceIcon } from "@/components/icons";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import {
  WorkspaceSectionError,
  workspaceSchemaMissingHint,
} from "@/components/garden/workspace-state";
import { MySocialLayout } from "@/components/social/my-social-layout";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { ToggleChip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { HiddenField } from "@/components/ui/hidden-field";
import { IconButton } from "@/components/ui/icon-button";
import { ListRow } from "@/components/ui/list-row";
import { formatLastEntry } from "@/lib/garden/garden-collection";
import { resolveIllustration } from "@/lib/illustrations";
import {
  buildLanguageAlternates,
  isPublicLocale,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import {
  fillSocialTemplate,
  getSocialSurfaceCopy,
  type SocialSurfaceCopy,
} from "@/lib/social-surface-copy";
import {
  groupNotificationEvents,
  listNotificationCenterPage,
  normalizeNotificationFilter,
  type GroupedNotificationEvent,
  type NotificationEventKind,
  type NotificationFilter,
} from "@/server/social-return-repository";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";

interface LocalizedNotificationsRouteProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: LocalizedNotificationsRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = isPublicLocale(localeParam) ? localeParam : "uk";
  const copy = getSocialSurfaceCopy(locale);
  return {
    title: `${copy.notifications.title} | OverGarden`,
    description: copy.notifications.description,
    alternates: isPublicLocale(localeParam)
      ? {
          canonical: localizedPath(locale, "/notifications"),
          languages: buildLanguageAlternates("/notifications"),
        }
      : undefined,
    robots: { index: false, follow: false },
  };
}

interface NotificationView {
  filter: NotificationFilter;
  unreadOnly: boolean;
  grouped: boolean;
  cursor: string | null;
}

type ReceiptOutcome = "read" | "unread" | "dismissed" | "failed";

/**
 * Activity (`OVE-501`): what other gardeners did, and the optional reminders
 * to write about the reader's own plants and animals.
 *
 * Every row says what happened, what it is about — the entry, or the plant or
 * animal with the space it lives in — and when; a reminder says when that
 * plant was last written about, and its Write opens the composer for exactly
 * that plant. Rows that would read the same are told apart by what differs
 * between them. The read state of a row and the count in the header are both
 * read back from the receipts, and a receipt that could not be written is
 * said beside its row. The preferences live on their own page.
 *
 * Both reads are settled (ADR-0023): a session that cannot be checked is not
 * "signed out", and a list that cannot be read is a failure with a retry of
 * the same view, never an empty list.
 */
export default async function LocalizedNotificationsRoute({
  params,
  searchParams,
}: LocalizedNotificationsRouteProps) {
  const [{ locale: localeParam }, query] = await Promise.all([
    params,
    searchParams ??
      Promise.resolve({} as Record<string, string | string[] | undefined>),
  ]);
  if (!isPublicLocale(localeParam)) notFound();
  const locale = localeParam;
  const copy = getSocialSurfaceCopy(locale);
  const view: NotificationView = {
    filter: normalizeNotificationFilter(firstParam(query.filter)),
    unreadOnly: firstParam(query.unread) === "1",
    grouped: firstParam(query.view) !== "individual",
    cursor: firstParam(query.cursor) ?? null,
  };
  const viewHref = notificationHref(locale, view);
  const layout = {
    locale,
    active: "notifications" as const,
    title: copy.notifications.title,
    description: copy.notifications.description,
  };

  const viewer = await resolveWorkspaceViewer();
  if (viewer.status === "unavailable") {
    return (
      <MySocialLayout {...layout}>
        <WorkspaceSectionError
          locale={locale}
          failure={viewer.failure}
          title={copy.notifications.loadErrorTitle}
          retryHref={viewHref}
          technicalHint={workspaceSchemaMissingHint(locale, viewer.failure)}
        />
      </MySocialLayout>
    );
  }
  if (viewer.status === "sign-in-required") {
    // Signing in comes back to this view, filters and all.
    return (
      <MySocialLayout {...layout}>
        <SignInPrompt
          locale={locale}
          next={viewHref}
          description={copy.notifications.signIn}
        />
      </MySocialLayout>
    );
  }

  const settingsLink = <NotificationSettingsLink locale={locale} />;
  const filters = <NotificationFilters locale={locale} view={view} />;
  const settled = await settleSection(
    () =>
      listNotificationCenterPage(viewer.scope, locale, {
        filter: view.filter,
        unreadOnly: view.unreadOnly,
        cursor: view.cursor,
      }),
    {
      // The preferences with the eight sources — nine reads, two waves
      // through a pool of five — then the receipts with the objects'
      // identities.
      deadlineMs: workspaceSectionDeadlineMs(3),
      surface: "notifications",
      section: "events",
    },
  );
  if (settled.status === "error") {
    return (
      <MySocialLayout {...layout} actions={settingsLink} controls={filters}>
        <WorkspaceSectionError
          locale={locale}
          failure={settled}
          title={copy.notifications.loadErrorTitle}
          retryHref={viewHref}
          technicalHint={workspaceSchemaMissingHint(locale, settled)}
        />
      </MySocialLayout>
    );
  }

  const page = settled.value;
  const rows = groupNotificationEvents(page.items, view.grouped);
  const outcome = readReceiptOutcome(query);
  const outcomeRow = outcome?.eventKey
    ? rows.find((row) => row.eventKeys.includes(outcome.eventKey!))
    : undefined;
  const today = new Date().toISOString().slice(0, 10);
  const identities = disambiguateRows(rows, locale, copy);
  const filtered = view.filter !== "all" || view.unreadOnly;

  return (
    <MySocialLayout
      {...layout}
      count={page.unreadCount}
      countLabel={copy.common.unreadCount(page.unreadCount)}
      actions={settingsLink}
      controls={filters}
    >
      {/* An outcome whose row is not on the page — dismissed, or on another
          page of the list — is said above the list. */}
      {outcome && !outcomeRow ? (
        <div id="notification-outcome" className="scroll-mt-24">
          <ReceiptOutcomeNotice copy={copy} outcome={outcome.result} />
        </div>
      ) : null}
      {rows.length === 0 ? (
        filtered ? (
          // Something exists and the filters excluded it: no illustration, the
          // filters the reader set, and a way to clear them (DESIGN.md §5.4).
          <EmptyState
            variant="no-results"
            title={copy.common.noResultsTitle}
            description={copy.common.noResultsDescription}
            action={
              <Link
                href={localizedPath(locale, "/notifications")}
                className={buttonVariants({ variant: "secondary" })}
              >
                {copy.common.clearFilters}
              </Link>
            }
          />
        ) : (
          <EmptyState
            illustration={resolveIllustration("empty-notifications")}
            title={copy.notifications.emptyTitle}
            description={copy.notifications.empty}
            action={
              <Link
                href={localizedPath(locale, "/journals")}
                className={buttonVariants()}
              >
                {copy.notifications.emptyAction}
              </Link>
            }
          />
        )
      ) : (
        <ul
          id="notification-list"
          aria-label={copy.notifications.listLabel}
          data-notification-list="true"
          className="grid"
        >
          {rows.map((row) => (
            <NotificationRow
              key={row.key}
              row={row}
              identity={identities.get(row.key) ?? []}
              locale={locale}
              today={today}
              returnTo={viewHref}
              outcome={outcomeRow === row ? outcome!.result : null}
            />
          ))}
        </ul>
      )}
      {page.nextCursor ? (
        <Link
          href={notificationHref(locale, { ...view, cursor: page.nextCursor })}
          className={buttonVariants({
            variant: "secondary",
            className: "w-full",
          })}
        >
          {copy.notifications.more}
          <ChevronDown aria-hidden="true" />
        </Link>
      ) : null}
    </MySocialLayout>
  );
}

function NotificationSettingsLink({ locale }: { locale: PublicLocale }) {
  const copy = getSocialSurfaceCopy(locale);
  return (
    <Link
      href={localizedPath(locale, "/notifications/settings")}
      data-notification-settings-link="true"
      className={buttonVariants({ variant: "secondary", size: "sm" })}
    >
      <Settings2 aria-hidden="true" />
      {copy.notifications.settings}
    </Link>
  );
}

/**
 * The filters, as chips over a `GET` form (DESIGN.md §5.1).
 *
 * They used to be a bordered box of links that stopped where its content did —
 * the half-width bar under the tab strip — and a link cannot carry
 * `aria-pressed`, so neither the state nor the box meant anything to a screen
 * reader.
 */
function NotificationFilters({
  locale,
  view,
}: {
  locale: PublicLocale;
  view: NotificationView;
}) {
  const copy = getSocialSurfaceCopy(locale);
  const action = localizedPath(locale, "/notifications");
  const { filter, unreadOnly, grouped } = view;
  const filters: Array<[Exclude<NotificationFilter, "all">, string]> = [
    ["comments", copy.notifications.comments],
    ["follows", copy.notifications.follows],
    ["mentions", copy.notifications.mentions],
    ["claims", copy.notifications.claims],
    ["reminders", copy.notifications.reminders],
  ];

  return (
    <div className="grid w-full gap-3">
      <form
        method="get"
        action={action}
        data-notification-filters="true"
        aria-label={copy.notifications.filtersLabel}
        className="flex max-w-full items-center gap-2 overflow-x-auto py-1"
      >
        {unreadOnly ? <HiddenField name="unread" value="1" /> : null}
        {grouped ? null : <HiddenField name="view" value="individual" />}
        <ToggleChip label={copy.notifications.all} pressed={filter === "all"} />
        {filters.map(([value, label]) => {
          const pressed = filter === value;
          return (
            <ToggleChip
              key={value}
              {...(pressed ? {} : { name: "filter", value })}
              label={label}
              pressed={pressed}
            />
          );
        })}
      </form>
      {/* One form per toggle. Two toggles in one form cannot both be turned
          off: the chip that is pressed submits no value, and a hidden field
          preserving the other would put this one straight back. */}
      <div className="flex max-w-full items-center gap-2 overflow-x-auto py-1">
        <form
          method="get"
          action={action}
          data-notification-unread-filter="true"
        >
          {filter === "all" ? null : (
            <HiddenField name="filter" value={filter} />
          )}
          {grouped ? null : <HiddenField name="view" value="individual" />}
          <ToggleChip
            {...(unreadOnly ? {} : { name: "unread", value: "1" })}
            icon={<MailOpen aria-hidden="true" className="size-4" />}
            label={copy.notifications.unread}
            pressed={unreadOnly}
          />
        </form>
        <form method="get" action={action} data-notification-view-filter="true">
          {filter === "all" ? null : (
            <HiddenField name="filter" value={filter} />
          )}
          {unreadOnly ? <HiddenField name="unread" value="1" /> : null}
          {/* Grouping is the default, so the chip turns it *off* by carrying
              `view=individual`, and carries nothing once it is off. */}
          <ToggleChip
            {...(grouped ? { name: "view", value: "individual" } : {})}
            icon={<Bell aria-hidden="true" className="size-4" />}
            label={copy.notifications.grouped}
            pressed={grouped}
          />
        </form>
      </div>
    </div>
  );
}

const KIND_ICONS: Record<NotificationEventKind, InterfaceIcon> = {
  comment: ChatCircle,
  reply: ChatCircle,
  profile_follow: UserPlus,
  object_follow: UserPlus,
  lineage_follow: GitBranch,
  mention: GitBranch,
  claim: GitBranch,
  question: Question,
  system: Plant,
};

/**
 * One row: what happened (the title), what it is about (the line beneath),
 * and who or what it came from and when (the meta line). The title link is
 * described by the other two lines, so a reader who reaches it by keyboard
 * hears all three.
 *
 * Unread is a **word** as well as a mark. The row used to say it with a blue
 * dot and 70 % opacity, and colour is never the only signal (DESIGN.md §8).
 */
function NotificationRow({
  row,
  identity,
  locale,
  today,
  returnTo,
  outcome,
}: {
  row: GroupedNotificationEvent;
  identity: string[];
  locale: PublicLocale;
  today: string;
  returnTo: string;
  outcome: ReceiptOutcome | null;
}) {
  const copy = getSocialSurfaceCopy(locale);
  const reminder = row.category === "reminder";
  const anchor = `notification-${row.eventKeys[0]}`;
  const summary =
    copy.notifications.summaries[row.summaryKey] ?? row.summaryKey;
  const title = row.count > 1 ? `${summary} (${row.count})` : summary;
  const name = [title, ...identity].join(" · ");
  const Icon =
    reminder && row.object?.objectKind === "animal"
      ? PawPrint
      : KIND_ICONS[row.kind];
  const stateLabel =
    row.count > 1 && row.unreadCount > 0
      ? fillSocialTemplate(copy.notifications.unreadOfGroup, {
          count: row.unreadCount,
        })
      : row.read
        ? copy.notifications.readBadge
        : copy.notifications.unreadBadge;

  return (
    <ListRow
      id={anchor}
      data-notification-row={row.category}
      data-notification-read={row.read ? "true" : "false"}
      data-notification-unread-count={row.unreadCount}
      className="scroll-mt-24"
      media={
        <span className="flex size-10 items-center justify-center rounded-lg bg-surface-sunken text-text-muted">
          <Icon aria-hidden="true" className="size-5" />
        </span>
      }
      title={title}
      href={row.href}
      linkProps={{
        "aria-describedby": [
          identity.length > 0 ? `${anchor}-about` : null,
          `${anchor}-meta`,
        ]
          .filter(Boolean)
          .join(" "),
        "data-notification-link": row.kind,
      }}
      description={
        identity.length > 0 ? (
          <span id={`${anchor}-about`} data-notification-about="true">
            {identity.join(" · ")}
          </span>
        ) : undefined
      }
      meta={
        <span
          id={`${anchor}-meta`}
          className="inline-flex flex-wrap items-center gap-x-2 gap-y-1"
        >
          <Badge tone={row.read ? "neutral" : "action"}>{stateLabel}</Badge>
          <span data-notification-origin={row.category}>
            {reminder
              ? copy.notifications.reminderOrigin
              : actorsLine(copy, row.actors)}
          </span>
          <span aria-hidden="true">·</span>
          {reminder ? (
            <LastEntry copy={copy} row={row} today={today} locale={locale} />
          ) : (
            <time dateTime={new Date(row.createdAt).toISOString()}>
              {formatDate(row.createdAt, locale)}
            </time>
          )}
        </span>
      }
      actions={
        <>
          {reminder && row.object ? (
            <Link
              href={reminderWriteHref(row.object.id, returnTo, anchor)}
              prefetch={false}
              aria-label={fillSocialTemplate(copy.notifications.writeLabel, {
                name: identity
                  .slice(0, 1)
                  .concat(identity.slice(2))
                  .join(" · "),
              })}
              data-notification-write={row.object.id}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              <NotePencil aria-hidden="true" />
              {copy.notifications.write}
            </Link>
          ) : null}
          <ReceiptForm
            eventKeys={row.eventKeys}
            state={row.read ? "unread" : "read"}
            returnTo={returnTo}
            label={fillSocialTemplate(copy.notifications.rowAction, {
              action: row.read
                ? copy.notifications.markUnread
                : copy.notifications.markRead,
              name,
            })}
            icon={row.read ? <MailOpen /> : <CheckCheck />}
          />
          <ReceiptForm
            eventKeys={row.eventKeys}
            state="dismissed"
            returnTo={returnTo}
            label={fillSocialTemplate(copy.notifications.rowAction, {
              action: copy.notifications.dismiss,
              name,
            })}
            icon={<EyeOff />}
          />
          {outcome ? (
            <div className="basis-full">
              <ReceiptOutcomeNotice copy={copy} outcome={outcome} />
            </div>
          ) : null}
        </>
      }
    />
  );
}

/** The last entry, as the garden list says it: a date, never a diagnosis. */
function LastEntry({
  copy,
  row,
  today,
  locale,
}: {
  copy: SocialSurfaceCopy;
  row: GroupedNotificationEvent;
  today: string;
  locale: PublicLocale;
}) {
  const date = row.object?.lastEntryDate;
  if (!date) {
    return (
      <span data-notification-last-entry="never">
        {copy.notifications.never}
      </span>
    );
  }
  const [before, after] = copy.notifications.lastEntry.split("{when}");
  return (
    <span data-notification-last-entry={date}>
      {before}
      <time dateTime={date}>{formatLastEntry(date, today, locale)}</time>
      {after}
    </span>
  );
}

function actorsLine(
  copy: SocialSurfaceCopy,
  actors: GroupedNotificationEvent["actors"],
) {
  if (actors.length === 0) return copy.notifications.fromSomeone;
  const shown = actors.slice(0, 2).join(", ");
  const names =
    actors.length > 2
      ? fillSocialTemplate(copy.notifications.andOthers, {
          actors: shown,
          count: actors.length - 2,
        })
      : shown;
  return fillSocialTemplate(copy.notifications.from, { actors: names });
}

function ReceiptOutcomeNotice({
  copy,
  outcome,
}: {
  copy: SocialSurfaceCopy;
  outcome: ReceiptOutcome;
}) {
  const failed = outcome === "failed";
  return (
    <Callout
      tone={failed ? "danger" : "success"}
      live={failed ? "assertive" : "polite"}
      data-notification-outcome={outcome}
      className="py-2"
    >
      <p>{copy.notifications.outcome[outcome]}</p>
    </Callout>
  );
}

function ReceiptForm({
  eventKeys,
  state,
  returnTo,
  label,
  icon,
}: {
  eventKeys: string[];
  state: "read" | "unread" | "dismissed";
  returnTo: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <form
      method="post"
      action="/api/notifications/receipts"
      data-notification-receipt={state}
    >
      {eventKeys.map((eventKey) => (
        <HiddenField key={eventKey} name="eventKey" value={eventKey} />
      ))}
      <HiddenField name="receiptState" value={state} />
      <HiddenField name="returnTo" value={returnTo} />
      <IconButton type="submit" variant="ghost" label={label}>
        {icon}
      </IconButton>
    </form>
  );
}

/**
 * What each row is about, told apart from every other row on the page.
 *
 * A reminder names the plant or animal, its kind, its space and its organism;
 * a comment names the entry and — when it is the reader's own — the plant and
 * space it is about; the other social rows name the reader's plant or animal
 * and its space. Two rows that still read the same (`OVE-501`, criterion 1:
 * two tomatoes in two gardens called "Город") gain what differs between them:
 * the variety, then the day each was added, then the minute.
 */
function disambiguateRows(
  rows: GroupedNotificationEvent[],
  locale: PublicLocale,
  copy: SocialSurfaceCopy,
): Map<string, string[]> {
  // Each level says a little more; a row climbs only while another row on
  // the page still reads exactly as it does.
  const levels: Array<(row: GroupedNotificationEvent) => string[]> = [
    (row) => describeRow(row, copy),
    (row) => [...describeRow(row, copy), ...optional(row.object?.variety)],
    (row) => [
      ...describeRow(row, copy),
      ...optional(row.object?.variety),
      ...optional(
        row.object &&
          fillSocialTemplate(copy.notifications.addedOn, {
            date: formatDay(row.object.addedOn, locale),
          }),
      ),
    ],
    (row) => [
      ...describeRow(row, copy),
      ...optional(row.object?.variety),
      ...optional(
        row.object &&
          fillSocialTemplate(copy.notifications.addedAt, {
            date: formatDay(row.object.addedOn, locale),
            time: formatMinute(row.object.addedAt, locale),
          }),
      ),
    ],
  ];
  const level = new Map(rows.map((row) => [row.key, 0]));
  const identity = (row: GroupedNotificationEvent) =>
    levels[level.get(row.key)!]!(row);
  for (let pass = 1; pass < levels.length; pass += 1) {
    const signature = (row: GroupedNotificationEvent) =>
      [row.summaryKey, row.actorMention ?? "", ...identity(row)].join("\u0000");
    const seen = new Map<string, number>();
    for (const row of rows) {
      seen.set(signature(row), (seen.get(signature(row)) ?? 0) + 1);
    }
    const repeated = rows.filter((row) => (seen.get(signature(row)) ?? 0) > 1);
    if (repeated.length === 0) break;
    for (const row of repeated) level.set(row.key, pass);
  }
  return new Map(rows.map((row) => [row.key, identity(row)]));
}

function optional(value: string | null | undefined | false): string[] {
  return value ? [value] : [];
}

function describeRow(
  row: GroupedNotificationEvent,
  copy: SocialSurfaceCopy,
): string[] {
  const object = row.object;
  if (row.category === "reminder") {
    if (!object) return row.targetLabel ? [row.targetLabel] : [];
    return [
      object.name,
      copy.notifications.kinds[object.objectKind],
      object.spaceName,
      object.species,
    ].filter((part): part is string => Boolean(part));
  }
  if (row.kind === "comment" || row.kind === "reply") {
    return [
      row.targetLabel ? `«${row.targetLabel}»` : null,
      object?.name ?? null,
      object?.spaceName ?? null,
    ].filter((part): part is string => Boolean(part));
  }
  if (object) return [object.name, object.spaceName];
  return row.targetLabel ? [row.targetLabel] : [];
}

/**
 * The composer for exactly this plant or animal, in one activation, and back
 * to this row of this view when it closes (`OVE-501`, criterion 2).
 */
function reminderWriteHref(objectId: string, returnTo: string, anchor: string) {
  const params = new URLSearchParams({
    object: objectId,
    returnTo: `${returnTo}#${anchor}`,
  });
  return `/garden/new?${params.toString()}`;
}

function readReceiptOutcome(
  query: Record<string, string | string[] | undefined>,
): { result: ReceiptOutcome; eventKey: string | null } | null {
  const result = firstParam(query.receipt);
  if (
    result !== "read" &&
    result !== "unread" &&
    result !== "dismissed" &&
    result !== "failed"
  ) {
    return null;
  }
  const eventKey = firstParam(query.event);
  return {
    result,
    eventKey: eventKey && /^[a-f0-9]{32}$/u.test(eventKey) ? eventKey : null,
  };
}

function notificationHref(locale: PublicLocale, input: NotificationView) {
  const params = new URLSearchParams();
  if (input.filter !== "all") params.set("filter", input.filter);
  if (input.unreadOnly) params.set("unread", "1");
  if (!input.grouped) params.set("view", "individual");
  if (input.cursor) params.set("cursor", input.cursor);
  const path = localizedPath(locale, "/notifications");
  return params.size ? `${path}?${params}` : path;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: Date | string, locale: PublicLocale) {
  return new Date(value).toLocaleString(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function formatMinute(value: string, locale: PublicLocale) {
  return new Date(value).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function formatDay(value: string, locale: PublicLocale) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
