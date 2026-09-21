import { BellIcon as Bell } from "@/components/icons/Bell";
import { ChecksIcon as CheckCheck } from "@/components/icons/Checks";
import { CaretDownIcon as ChevronDown } from "@/components/icons/CaretDown";
import { EyeSlashIcon as EyeOff } from "@/components/icons/EyeSlash";
import { EnvelopeOpenIcon as MailOpen } from "@/components/icons/EnvelopeOpen";
import { SlidersIcon as Settings2 } from "@/components/icons/Sliders";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MySocialLayout } from "@/components/social/my-social-layout";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ToggleChip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { resolveIllustration } from "@/lib/illustrations";
import {
  buildLanguageAlternates,
  isPublicLocale,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import { getSocialSurfaceCopy } from "@/lib/social-surface-copy";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { scopedToUser } from "@/server/request-scope";
import {
  getNotificationPreferences,
  groupNotificationEvents,
  listNotificationCenterPage,
  type GroupedNotificationEvent,
  type NotificationEvent,
  type NotificationFilter,
  type NotificationPreferences,
} from "@/server/social-return-repository";
import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { IconButton } from "@/components/ui/icon-button";
import { HiddenField } from "@/components/ui/hidden-field";
import { Checkbox } from "@/components/ui/checkbox";

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
  const copy = getSocialSurfaceCopy(localeParam);
  const session = await getCurrentSession();
  const userId = session?.user?.id;

  if (!userId) {
    return (
      <MySocialLayout
        locale={localeParam}
        active="notifications"
        title={copy.notifications.title}
        description={copy.notifications.description}
      >
        <SignInPrompt
          locale={localeParam}
          next={localizedPath(localeParam, "/notifications")}
          description={copy.notifications.signIn}
        />
      </MySocialLayout>
    );
  }

  const scope = scopedToUser(userId, getSessionId(session));
  const filter = parseFilter(firstParam(query.filter));
  const unreadOnly = firstParam(query.unread) === "1";
  const grouped = firstParam(query.view) !== "individual";
  const [page, preferences] = await Promise.all([
    listNotificationCenterPage(scope, localeParam, {
      filter,
      unreadOnly,
      cursor: firstParam(query.cursor),
    }),
    getNotificationPreferences(scope),
  ]);
  const events: Array<NotificationEvent | GroupedNotificationEvent> = grouped
    ? groupNotificationEvents(page.items)
    : page.items;
  const returnTo = notificationHref(localeParam, {
    filter,
    unreadOnly,
    grouped,
    cursor: firstParam(query.cursor),
  });
  const filtered = filter !== "all" || unreadOnly;

  return (
    <MySocialLayout
      locale={localeParam}
      active="notifications"
      title={copy.notifications.title}
      description={copy.notifications.description}
      count={page.unreadCount}
      countLabel={copy.common.unreadCount(page.unreadCount)}
      controls={
        <NotificationFilters
          locale={localeParam}
          filter={filter}
          unreadOnly={unreadOnly}
          grouped={grouped}
        />
      }
    >
      <NotificationSettings locale={localeParam} preferences={preferences} />
      {events.length === 0 ? (
        filtered ? (
          // Something exists and the filters excluded it: no illustration, the
          // filters the reader set, and a way to clear them (DESIGN.md §5.4).
          <EmptyState
            variant="no-results"
            title={copy.common.noResultsTitle}
            description={copy.common.noResultsDescription}
            action={
              <Link
                href={localizedPath(localeParam, "/notifications")}
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
                href={localizedPath(localeParam, "/journals")}
                className={buttonVariants()}
              >
                {copy.notifications.emptyAction}
              </Link>
            }
          />
        )
      ) : (
        <ul className="grid">
          {events.map((event) => (
            <NotificationRow
              key={event.key}
              event={event}
              locale={localeParam}
              returnTo={returnTo}
            />
          ))}
        </ul>
      )}
      {page.nextCursor ? (
        <Link
          href={notificationHref(localeParam, {
            filter,
            unreadOnly,
            grouped,
            cursor: page.nextCursor,
          })}
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
  filter,
  unreadOnly,
  grouped,
}: {
  locale: PublicLocale;
  filter: NotificationFilter;
  unreadOnly: boolean;
  grouped: boolean;
}) {
  const copy = getSocialSurfaceCopy(locale);
  const action = localizedPath(locale, "/notifications");
  const filters: Array<[Exclude<NotificationFilter, "all">, string]> = [
    ["comments", copy.notifications.comments],
    ["follows", copy.notifications.follows],
    ["mentions", copy.notifications.mentions],
    ["claims", copy.notifications.claims],
    ["system", copy.notifications.system],
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

function NotificationSettings({
  locale,
  preferences,
}: {
  locale: PublicLocale;
  preferences: NotificationPreferences;
}) {
  const copy = getSocialSurfaceCopy(locale);
  const options: Array<[keyof NotificationPreferences, string]> = [
    ["comments", copy.notifications.comments],
    ["replies", copy.notifications.replies],
    ["follows", copy.notifications.follows],
    ["mentions", copy.notifications.mentions],
    ["claims", copy.notifications.claims],
    ["system", copy.notifications.system],
  ];
  return (
    <details
      data-notification-settings="true"
      className="rounded-lg border border-border px-4 py-3"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-body-sm font-medium text-text outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
        <Settings2 className="size-4" aria-hidden="true" />
        {copy.notifications.settings}
      </summary>
      <form
        method="post"
        action="/api/notifications/preferences"
        className="mt-4 grid gap-3 sm:grid-cols-2"
      >
        <HiddenField name="locale" value={locale} />
        {options.map(([key, label]) => (
          <Checkbox
            key={key}
            name={key}
            defaultChecked={preferences[key]}
            label={label}
            className="items-center"
          />
        ))}
        <Button type="submit" className="w-fit sm:col-span-2">
          {copy.notifications.saveSettings}
        </Button>
      </form>
    </details>
  );
}

/**
 * One notification: what happened, to what, when, and a link to the thing.
 *
 * Unread is a **word** as well as a mark. The row used to say it with a blue
 * dot and 70 % opacity, and colour is never the only signal (DESIGN.md §8).
 */
function NotificationRow({
  event,
  locale,
  returnTo,
}: {
  event: NotificationEvent | GroupedNotificationEvent;
  locale: PublicLocale;
  returnTo: string;
}) {
  const copy = getSocialSurfaceCopy(locale);
  const eventKeys = "eventKeys" in event ? event.eventKeys : [event.key];
  const count = "count" in event ? event.count : 1;
  const summary =
    copy.notifications.summaries[event.summaryKey] ?? event.summaryKey;
  const subject = [event.actorMention, event.targetLabel]
    .filter(Boolean)
    .join(" · ");

  return (
    <li
      data-notification-read={event.read ? "true" : "false"}
      className="relative flex flex-col gap-3 border-b border-border py-4 last:border-b-0 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={event.read ? "neutral" : "action"}>
            {event.read
              ? copy.notifications.readBadge
              : copy.notifications.unreadBadge}
          </Badge>
          <time
            dateTime={new Date(event.createdAt).toISOString()}
            className="text-caption text-text-muted"
          >
            {formatDate(event.createdAt, locale)}
          </time>
        </div>
        <p className="text-h4 text-text-heading">
          <Link
            href={event.href}
            className="rounded-sm outline-none before:absolute before:inset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            {summary}
            {count > 1 ? ` (${count})` : ""}
          </Link>
        </p>
        {subject ? (
          <p className="text-body-sm text-text-muted">{subject}</p>
        ) : null}
      </div>
      <div className="relative z-sticky flex shrink-0 flex-wrap gap-2">
        <ReceiptForm
          eventKeys={eventKeys}
          state={event.read ? "unread" : "read"}
          returnTo={returnTo}
          label={
            event.read
              ? copy.notifications.markUnread
              : copy.notifications.markRead
          }
          icon={event.read ? <MailOpen /> : <CheckCheck />}
        />
        <ReceiptForm
          eventKeys={eventKeys}
          state="dismissed"
          returnTo={returnTo}
          label={copy.notifications.dismiss}
          icon={<EyeOff />}
        />
      </div>
    </li>
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
    <form method="post" action="/api/notifications/receipts">
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

function notificationHref(
  locale: PublicLocale,
  input: {
    filter: NotificationFilter;
    unreadOnly: boolean;
    grouped: boolean;
    cursor?: string | null;
  },
) {
  const params = new URLSearchParams();
  if (input.filter !== "all") params.set("filter", input.filter);
  if (input.unreadOnly) params.set("unread", "1");
  if (!input.grouped) params.set("view", "individual");
  if (input.cursor) params.set("cursor", input.cursor);
  const path = localizedPath(locale, "/notifications");
  return params.size ? `${path}?${params}` : path;
}

function parseFilter(value: string | undefined): NotificationFilter {
  return value === "comments" ||
    value === "follows" ||
    value === "mentions" ||
    value === "claims" ||
    value === "system"
    ? value
    : "all";
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
  });
}
