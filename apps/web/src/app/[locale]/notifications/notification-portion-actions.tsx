"use server";

import {
  NotificationRows,
  notificationHref,
} from "@/components/social/notification-rows";
import { isPublicLocale } from "@/lib/public-localization";
import type { ShowMorePortion } from "@/lib/show-more";
import {
  listNotificationCenterPage,
  normalizeNotificationFilter,
} from "@/server/social-return-repository";
import { resolveWorkspaceViewer } from "@/server/workspace-access";

/**
 * The notification list's next portion for «Показати ще» (DESIGN.md §5.26),
 * for the signed-in reader it belongs to and under the same filters.
 */
export async function loadNotificationPortion(
  context: {
    locale: string;
    filter: string;
    unreadOnly: boolean;
    grouped: boolean;
  },
  token: string,
): Promise<ShowMorePortion | null> {
  if (!isPublicLocale(context.locale)) return null;
  const locale = context.locale;
  const viewer = await resolveWorkspaceViewer();
  if (viewer.status !== "signed-in") return null;
  const view = {
    filter: normalizeNotificationFilter(context.filter),
    unreadOnly: context.unreadOnly === true,
    grouped: context.grouped !== false,
  };
  const page = await listNotificationCenterPage(viewer.scope, locale, {
    filter: view.filter,
    unreadOnly: view.unreadOnly,
    cursor: token,
  });
  if (page.items.length === 0) return null;
  return {
    items: (
      <NotificationRows
        items={page.items}
        grouped={view.grouped}
        locale={locale}
        returnTo={notificationHref(locale, { ...view, cursor: null })}
      />
    ),
    next: page.nextCursor
      ? {
          token: page.nextCursor,
          href: notificationHref(locale, { ...view, cursor: page.nextCursor }),
        }
      : null,
  };
}
