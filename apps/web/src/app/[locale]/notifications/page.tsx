import { BellIcon as Bell } from "@/components/icons/Bell";
import { EnvelopeOpenIcon as MailOpen } from "@/components/icons/EnvelopeOpen";
import { SlidersIcon as Settings2 } from "@/components/icons/Sliders";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import {
  NotificationRows,
  ReceiptOutcomeNotice,
  notificationHref,
  type NotificationView,
  type ReceiptOutcome,
} from "@/components/social/notification-rows";
import { ShowMoreList } from "@/components/ui/show-more-list";
import { getShowMoreCopy } from "@/lib/show-more";
import { loadNotificationPortion } from "./notification-portion-actions";
import {
  WorkspaceSectionError,
  workspaceSchemaMissingHint,
} from "@/components/garden/workspace-state";
import { MySocialLayout } from "@/components/social/my-social-layout";
import { buttonVariants } from "@/components/ui/button";
import { ToggleChip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { HiddenField } from "@/components/ui/hidden-field";
import { resolveIllustration } from "@/lib/illustrations";
import {
  buildLanguageAlternates,
  isPublicLocale,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import { getSocialSurfaceCopy } from "@/lib/social-surface-copy";
import {
  groupNotificationEvents,
  listNotificationCenterPage,
  normalizeNotificationFilter,
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
        <ShowMoreList
          as="ul"
          id="notification-list"
          aria-label={copy.notifications.listLabel}
          data-notification-list="true"
          className="grid"
          copy={getShowMoreCopy(locale)}
          next={
            page.nextCursor
              ? {
                  token: page.nextCursor,
                  href: notificationHref(locale, {
                    ...view,
                    cursor: page.nextCursor,
                  }),
                }
              : null
          }
          load={loadNotificationPortion.bind(null, {
            locale,
            filter: view.filter,
            unreadOnly: view.unreadOnly,
            grouped: view.grouped,
          })}
        >
          <NotificationRows
            items={page.items}
            grouped={view.grouped}
            locale={locale}
            returnTo={viewHref}
            outcome={outcome}
          />
        </ShowMoreList>
      )}
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

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
