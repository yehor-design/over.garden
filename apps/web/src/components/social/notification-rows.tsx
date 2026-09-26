import { ChatCircleIcon as ChatCircle } from "@/components/icons/ChatCircle";
import { ChecksIcon as CheckCheck } from "@/components/icons/Checks";
import { EyeSlashIcon as EyeOff } from "@/components/icons/EyeSlash";
import { EnvelopeOpenIcon as MailOpen } from "@/components/icons/EnvelopeOpen";
import { GitBranchIcon as GitBranch } from "@/components/icons/GitBranch";
import { NotePencilIcon as NotePencil } from "@/components/icons/NotePencil";
import { PawPrintIcon as PawPrint } from "@/components/icons/PawPrint";
import { PlantIcon as Plant } from "@/components/icons/Plant";
import { QuestionIcon as Question } from "@/components/icons/Question";
import { UserPlusIcon as UserPlus } from "@/components/icons/UserPlus";
import type { InterfaceIcon } from "@/components/icons";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { HiddenField } from "@/components/ui/hidden-field";
import { IconButton } from "@/components/ui/icon-button";
import { ListRow } from "@/components/ui/list-row";
import { formatLastEntry } from "@/lib/garden/garden-collection";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import {
  fillSocialTemplate,
  getSocialSurfaceCopy,
  type SocialSurfaceCopy,
} from "@/lib/social-surface-copy";
import {
  groupNotificationEvents,
  type GroupedNotificationEvent,
  type NotificationEventKind,
  type NotificationFilter,
} from "@/server/social-return-repository";

export interface NotificationView {
  filter: NotificationFilter;
  unreadOnly: boolean;
  grouped: boolean;
  cursor: string | null;
}

export type ReceiptOutcome = "read" | "unread" | "dismissed" | "failed";

/**
 * A portion of the notification list as its rows (`OVE-501`), grouped and
 * told apart within the portion, the same for the page's first portion and
 * every «Показати ще» portion after it (DESIGN.md §5.26).
 */
export function NotificationRows({
  items,
  grouped,
  locale,
  returnTo,
  outcome = null,
}: {
  items: Parameters<typeof groupNotificationEvents>[0];
  grouped: boolean;
  locale: PublicLocale;
  returnTo: string;
  outcome?: { result: ReceiptOutcome; eventKey: string | null } | null;
}) {
  const copy = getSocialSurfaceCopy(locale);
  const rows = groupNotificationEvents(items, grouped);
  const outcomeRow = outcome?.eventKey
    ? rows.find((row) => row.eventKeys.includes(outcome.eventKey!))
    : undefined;
  const today = new Date().toISOString().slice(0, 10);
  const identities = disambiguateRows(rows, locale, copy);
  return rows.map((row) => (
    <NotificationRow
      key={row.key}
      row={row}
      identity={identities.get(row.key) ?? []}
      locale={locale}
      today={today}
      returnTo={returnTo}
      outcome={outcomeRow === row ? outcome!.result : null}
    />
  ));
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

export function ReceiptOutcomeNotice({
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

export function notificationHref(
  locale: PublicLocale,
  input: NotificationView,
) {
  const params = new URLSearchParams();
  if (input.filter !== "all") params.set("filter", input.filter);
  if (input.unreadOnly) params.set("unread", "1");
  if (!input.grouped) params.set("view", "individual");
  if (input.cursor) params.set("cursor", input.cursor);
  const path = localizedPath(locale, "/notifications");
  return params.size ? `${path}?${params}` : path;
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
