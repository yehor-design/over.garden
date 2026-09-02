import {
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  EyeOff,
  MailOpen,
  Settings2,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  MySocialLayout,
  SocialEmptyState,
} from "@/components/social/my-social-layout";
import { buttonVariants } from "@/components/ui/button";
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
import { GardenAuthPanel } from "../../garden/garden-auth-panel";

export const dynamic = "force-dynamic";

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
        <GardenAuthPanel
          initialMessage={copy.notifications.signIn}
          locale={localeParam}
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
        <SocialEmptyState>{copy.notifications.empty}</SocialEmptyState>
      ) : (
        <ol className="divide-y divide-border border-y border-border">
          {events.map((event) => (
            <NotificationRow
              key={event.key}
              event={event}
              locale={localeParam}
              returnTo={returnTo}
            />
          ))}
        </ol>
      )}
      {page.nextCursor ? (
        <Link
          href={notificationHref(localeParam, {
            filter,
            unreadOnly,
            grouped,
            cursor: page.nextCursor,
          })}
          className="flex min-h-11 items-center justify-center gap-2 border border-border px-4 text-sm font-medium hover:bg-muted"
        >
          {copy.notifications.more}
          <ChevronDown className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
    </MySocialLayout>
  );
}

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
  const filters: Array<[NotificationFilter, string]> = [
    ["all", copy.notifications.all],
    ["comments", copy.notifications.comments],
    ["follows", copy.notifications.follows],
    ["mentions", copy.notifications.mentions],
    ["claims", copy.notifications.claims],
    ["system", copy.notifications.system],
  ];
  return (
    <>
      <div
        className="flex overflow-x-auto border border-border"
        role="group"
        aria-label={copy.notifications.filtersLabel}
      >
        {filters.map(([value, label]) => (
          <Link
            key={value}
            href={notificationHref(locale, {
              filter: value,
              unreadOnly,
              grouped,
            })}
            aria-current={filter === value ? "true" : undefined}
            className={filterClass(filter === value)}
          >
            {label}
          </Link>
        ))}
      </div>
      <Link
        href={notificationHref(locale, {
          filter,
          unreadOnly: !unreadOnly,
          grouped,
        })}
        aria-current={unreadOnly ? "true" : undefined}
        className={filterClass(unreadOnly)}
      >
        <MailOpen className="size-4" aria-hidden="true" />
        {copy.notifications.unread}
      </Link>
      <Link
        href={notificationHref(locale, {
          filter,
          unreadOnly,
          grouped: !grouped,
        })}
        aria-current={grouped ? "true" : undefined}
        className={filterClass(grouped)}
      >
        <Bell className="size-4" aria-hidden="true" />
        {copy.notifications.grouped}
      </Link>
    </>
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
    <details className="border-y border-border py-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
        <Settings2 className="size-4" aria-hidden="true" />
        {copy.notifications.settings}
      </summary>
      <form
        method="post"
        action="/api/notifications/preferences"
        className="mt-4 grid gap-3 sm:grid-cols-2"
      >
        <input type="hidden" name="locale" value={locale} />
        {options.map(([key, label]) => (
          <label key={key} className="flex min-h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={key}
              defaultChecked={preferences[key]}
              className="size-4 accent-primary"
            />
            {label}
          </label>
        ))}
        <button
          type="submit"
          className={buttonVariants({ className: "w-fit sm:col-span-2" })}
        >
          <Check className="size-4" aria-hidden="true" />
          {copy.notifications.saveSettings}
        </button>
      </form>
    </details>
  );
}

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
  return (
    <li className={`grid gap-3 py-4 ${event.read ? "opacity-70" : ""}`}>
      <div className="flex gap-3">
        <span
          className={`mt-2 size-2 shrink-0 rounded-full ${event.read ? "bg-muted" : "bg-primary"}`}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <Link href={event.href} className="grid gap-1 hover:underline">
            <p className="font-medium text-foreground">
              {summary}
              {count > 1 ? ` (${count})` : ""}
            </p>
            <p className="text-sm text-muted-foreground">
              {[event.actorMention, event.targetLabel]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </Link>
          <time className="text-xs text-muted-foreground">
            {formatDate(event.createdAt, locale)}
          </time>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pl-5">
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
        <input key={eventKey} type="hidden" name="eventKey" value={eventKey} />
      ))}
      <input type="hidden" name="receiptState" value={state} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        type="submit"
        title={label}
        className={buttonVariants({ variant: "ghost", size: "icon" })}
      >
        {icon}
        <span className="sr-only">{label}</span>
      </button>
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

function filterClass(active: boolean) {
  return `flex min-h-9 shrink-0 items-center gap-2 border-r border-border px-3 py-2 text-sm last:border-r-0 ${
    active
      ? "bg-foreground text-background"
      : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;
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
