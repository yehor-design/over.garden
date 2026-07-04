import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import {
  buildLanguageAlternates,
  isPublicLocale,
  localizedPath,
} from "@/lib/public-localization";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { scopedToUser } from "@/server/request-scope";
import {
  listNotificationCenter,
  type NotificationActionKind,
  type NotificationCenterEvent,
  type SocialObjectReadback,
} from "@/server/social-readback-repository";
import { GardenAuthPanel } from "../../garden/garden-auth-panel";

export const dynamic = "force-dynamic";

interface LocalizedNotificationsRouteProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: LocalizedNotificationsRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = isPublicLocale(localeParam) ? localeParam : "uk";

  return {
    title: "Notifications | OverGarden",
    alternates: isPublicLocale(localeParam)
      ? {
          canonical: localizedPath(locale, "/notifications"),
          languages: buildLanguageAlternates("/notifications"),
        }
      : undefined,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function LocalizedNotificationsRoute({
  params,
}: LocalizedNotificationsRouteProps) {
  const { locale: localeParam } = await params;
  if (!isPublicLocale(localeParam)) notFound();

  const session = await getCurrentSession();
  const userId = session?.user?.id;

  if (!userId) {
    return (
      <NotificationsShell locale={localeParam}>
        <GardenAuthPanel initialMessage="Sign in to open notifications." />
      </NotificationsShell>
    );
  }

  const scope = scopedToUser(userId, getSessionId(session));
  const events = await listNotificationCenter(scope);

  return (
    <NotificationsShell locale={localeParam} eventCount={events.length}>
      {events.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm leading-6 text-muted-foreground">
          No notifications yet. Review lineage claims or follow a lineage object
          to keep new activity here.
        </p>
      ) : (
        <ol className="grid gap-3">
          {events.map((event) => (
            <NotificationCard
              key={event.key}
              event={event}
              locale={localeParam}
            />
          ))}
        </ol>
      )}
    </NotificationsShell>
  );
}

function NotificationsShell({
  locale,
  eventCount,
  children,
}: {
  locale: "uk" | "bg" | "ru";
  eventCount?: number;
  children: ReactNode;
}) {
  return (
    <main
      lang={locale}
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8"
    >
      <header className="flex flex-col gap-4 border-b border-border pb-5">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/garden"
            className={buttonVariants({
              variant: "outline",
              className: "self-start",
            })}
          >
            Garden
          </Link>
          <Link
            href={localizedPath(locale, "/feed")}
            className={buttonVariants({
              variant: "outline",
              className: "self-start",
            })}
          >
            Followed feed
          </Link>
          <Link
            href="/garden/lineage/claims"
            className={buttonVariants({
              variant: "outline",
              className: "self-start",
            })}
          >
            Lineage claims
          </Link>
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Notifications
          </h1>
          {typeof eventCount === "number" ? (
            <p className="text-sm text-muted-foreground">
              {eventCount} current event{eventCount === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
      </header>

      {children}
    </main>
  );
}

function NotificationCard({
  event,
  locale,
}: {
  event: NotificationCenterEvent;
  locale: "uk" | "bg" | "ru";
}) {
  const action = notificationAction(event.actionKind, locale);

  return (
    <li className="grid gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid min-w-0 gap-1">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {notificationKindLabel(event.kind)}
          </p>
          <h2 className="text-base font-semibold break-words text-foreground">
            {event.summary}
          </h2>
          {event.detail ? (
            <p className="text-sm leading-6 break-words text-muted-foreground">
              {event.detail}
            </p>
          ) : null}
        </div>
        <time className="text-xs whitespace-nowrap text-muted-foreground">
          {formatDate(event.createdAt)}
        </time>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {event.actorMention ? (
          <span className="rounded-md border border-border px-2 py-1 font-mono">
            {event.actorMention}
          </span>
        ) : null}
        {event.primaryObject ? (
          <ObjectMeta object={event.primaryObject} />
        ) : null}
        {event.secondaryObject ? (
          <ObjectMeta object={event.secondaryObject} />
        ) : null}
      </div>

      {action ? (
        <Link
          href={action.href}
          className={buttonVariants({ className: "w-fit" })}
        >
          {action.label}
        </Link>
      ) : null}
    </li>
  );
}

function notificationKindLabel(kind: NotificationCenterEvent["kind"]) {
  switch (kind) {
    case "lineage_claim_request":
      return "Claim";
    case "lineage_claim_decision":
      return "Claim decision";
    case "lineage_question":
      return "Question";
    case "lineage_follow":
      return "Follow";
  }
}

function notificationAction(
  actionKind: NotificationActionKind | null,
  locale: "uk" | "bg" | "ru",
) {
  switch (actionKind) {
    case "review_claims":
      return { href: "/garden/lineage/claims", label: "Review" };
    case "open_lineage_questions":
      return { href: "/garden/lineage/questions", label: "Open" };
    case "open_followed_feed":
      return { href: localizedPath(locale, "/feed"), label: "Open feed" };
    default:
      return null;
  }
}

function ObjectMeta({ object }: { object: SocialObjectReadback }) {
  const meta = [
    object.displayName,
    object.varietyText ?? "Unknown variety",
    object.catalogKind ? object.catalogKind.replaceAll("_", " ") : null,
  ].filter(Boolean);

  return (
    <>
      {meta.map((item) => (
        <span key={item} className="rounded-md border border-border px-2 py-1">
          {item}
        </span>
      ))}
    </>
  );
}

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
