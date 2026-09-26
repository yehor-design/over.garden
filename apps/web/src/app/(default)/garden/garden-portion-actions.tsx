"use server";

import { GardenItemRows } from "@/components/garden/garden-item-row";
import {
  GARDEN_COLLECTION_PAGE_SIZE,
  gardenCollectionHref,
  gardenCollectionItemAnchor,
  gardenCollectionWriteHref,
  normalizeGardenCollectionRequest,
  type GardenCollectionItem,
} from "@/lib/garden/garden-collection";
import {
  gardenSpacePath,
  isSpaceId,
  SPACE_HISTORY_PAGE_SIZE,
} from "@/lib/garden/space-page";
import { isPublicLocale } from "@/lib/public-localization";
import type { ShowMorePortion } from "@/lib/show-more";
import { getSpacePageCopy } from "@/lib/space-page-copy";
import { getPublicAuthorHandle } from "@/server/author-handle-repository";
import {
  listGardenObjects,
  listGardenSpaces,
} from "@/server/garden-collection-repository";
import { listSpaceHistory } from "@/server/space-page-repository";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";

import { SpaceHistoryRow } from "./spaces/[spaceId]/space-history-row";

/**
 * The next portion of «Мій сад»'s spaces or plants and animals — or of one
 * space's plants and animals — for «Показати ще» (DESIGN.md §5.26), for the
 * signed-in owner only and under the same search and order.
 */
export async function loadGardenGroupPortion(
  context: {
    locale: string;
    kind: string;
    q: string;
    sort: string;
    /** One space's own list, on the space's page. */
    spaceId: string | null;
  },
  token: string,
): Promise<ShowMorePortion | null> {
  if (!isPublicLocale(context.locale)) return null;
  const locale = context.locale;
  const viewer = await resolveWorkspaceViewer();
  if (viewer.status !== "signed-in") return null;
  const kind = context.kind === "space" ? "space" : "object";
  const request = normalizeGardenCollectionRequest({
    q: context.q,
    sort: context.sort,
    kind: context.spaceId ? "object" : kind,
    page: token,
  });
  if (request.page < 2) return null;
  const spaceId =
    context.spaceId && isSpaceId(context.spaceId) ? context.spaceId : null;
  // Settled like every workspace read (ADR-0023): a read that fails is no
  // portion, and the link then navigates to the address that retries it.
  const settled = await settleSection(
    async (): Promise<{ items: GardenCollectionItem[]; total: number }> =>
      kind === "space" && !spaceId
        ? listGardenSpaces(viewer.scope, request)
        : listGardenObjects(viewer.scope, request, spaceId ? { spaceId } : {}),
    {
      deadlineMs: workspaceSectionDeadlineMs(2),
      surface: "garden",
      section: "show-more",
    },
  );
  if (settled.status !== "ready") return null;
  const group = settled.value;
  if (group.items.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  const more = request.page * GARDEN_COLLECTION_PAGE_SIZE < group.total;
  const hrefFor = (page: number) =>
    spaceId
      ? gardenSpacePath(spaceId, { view: "objects", page }, "space-objects")
      : gardenCollectionHref(request, { page });
  return {
    items: (
      <GardenItemRows
        items={group.items}
        locale={locale}
        today={today}
        showSpace={!spaceId}
        writeHrefFor={(item) =>
          spaceId
            ? `/garden/new?${new URLSearchParams({
                object: item.id,
                returnTo: gardenSpacePath(
                  spaceId,
                  { view: "objects", page: request.page },
                  gardenCollectionItemAnchor(item),
                ),
              }).toString()}`
            : gardenCollectionWriteHref(item, request)
        }
      />
    ),
    next: more
      ? { token: String(request.page + 1), href: hrefFor(request.page + 1) }
      : null,
  };
}

/** The next portion of one space's history, for its owner. */
export async function loadSpaceHistoryPortion(
  context: { locale: string; spaceId: string },
  token: string,
): Promise<ShowMorePortion | null> {
  if (!isPublicLocale(context.locale)) return null;
  const locale = context.locale;
  if (!isSpaceId(context.spaceId)) return null;
  if (!/^\d{1,6}$/u.test(token) || Number(token) < 2) return null;
  const viewer = await resolveWorkspaceViewer();
  if (viewer.status !== "signed-in") return null;
  const page = Number(token);
  const request = { view: "history" as const, page };
  const settled = await settleSection(
    async () => {
      const authorHandle = await getPublicAuthorHandle(viewer.scope.userId);
      return listSpaceHistory(
        viewer.scope,
        context.spaceId,
        request,
        authorHandle,
      );
    },
    {
      deadlineMs: workspaceSectionDeadlineMs(2),
      surface: "space",
      section: "show-more",
    },
  );
  if (settled.status !== "ready") return null;
  const history = settled.value;
  if (history.entries.length === 0) return null;
  const copy = getSpacePageCopy(locale);
  const more = page * SPACE_HISTORY_PAGE_SIZE < history.total;
  return {
    items: history.entries.map((entry) => (
      <SpaceHistoryRow
        key={entry.id}
        copy={copy}
        entry={entry}
        locale={locale}
        returnTo={gardenSpacePath(
          context.spaceId,
          request,
          `space-entry-${entry.id}`,
        )}
      />
    )),
    next: more
      ? {
          token: String(page + 1),
          href: gardenSpacePath(
            context.spaceId,
            { view: "history", page: page + 1 },
            "space-history",
          ),
        }
      : null,
  };
}
