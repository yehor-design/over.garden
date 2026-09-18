import {
  publicCommunityPath,
  publicCommunityDiscussionPath,
} from "@/lib/garden/public-paths";
import { buildListingHref } from "@/lib/public-listing-filters";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";

/**
 * What a community page is asked for, and what it is allowed to say back
 * (`OVE-454`).
 *
 * Two rules here are the whole of the task's first acceptance criterion, and
 * both are easier to state than to keep:
 *
 * 1. **A count of zero is not a fact worth printing.** The one community on
 *    the site renders `0 Записи · 0 Живі об'єкти · 0 Учасники` today, which
 *    tells a visitor only that nothing is happening — three numbers spending
 *    the most valuable row on the card to say so. `communityFacts` returns
 *    what a community *has*; a zero is simply absent from the list, and a
 *    community with nothing yet gets structure instead (ADR-0031 D3).
 * 2. **The filters speak the vocabulary `OVE-448` fixed.** One query
 *    parameter per facet, named for the facet, and absent means unset — so
 *    there is no `kind=all`, and the community's canonical address is its own
 *    path with no query at all.
 *
 * `cursor` is the one parameter that is not a facet: it is a paging position,
 * opaque, and it is dropped whenever a facet changes, because page four of a
 * narrower listing is a different set of results and usually an empty one.
 */

export const PUBLIC_COMMUNITY_OBJECT_KINDS = ["plant", "animal"] as const;

export type PublicCommunityObjectKind =
  (typeof PUBLIC_COMMUNITY_OBJECT_KINDS)[number];

/** `all` is the absence of the parameter, never a value it carries. */
export type PublicCommunityKindFilter = "all" | PublicCommunityObjectKind;

export const PUBLIC_COMMUNITY_MAX_QUERY_LENGTH = 100;

const KINDS = new Set<string>(PUBLIC_COMMUNITY_OBJECT_KINDS);

export interface PublicCommunityViewRequest {
  readonly query: string;
  readonly kind: PublicCommunityKindFilter;
  readonly cursor: string | null;
}

export const EMPTY_PUBLIC_COMMUNITY_VIEW_REQUEST: PublicCommunityViewRequest = {
  query: "",
  kind: "all",
  cursor: null,
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function normalizePublicCommunityViewRequest(
  searchParams: Record<string, string | string[] | undefined> = {},
): PublicCommunityViewRequest {
  const kind = firstParam(searchParams.kind);
  return {
    query: firstParam(searchParams.q)
      .trim()
      .slice(0, PUBLIC_COMMUNITY_MAX_QUERY_LENGTH),
    kind: KINDS.has(kind) ? (kind as PublicCommunityObjectKind) : "all",
    cursor: firstParam(searchParams.cursor).slice(0, 512) || null,
  };
}

/** True when nothing is set — the community's own canonical address. */
export function isUnfilteredCommunityViewRequest(
  request: PublicCommunityViewRequest,
): boolean {
  return (
    request.query === "" && request.kind === "all" && request.cursor === null
  );
}

export function communityBasePath(
  locale: PublicLocale,
  slug: string,
): string {
  return localizedPath(locale, publicCommunityPath(slug));
}

export function communityDiscussionPath(
  locale: PublicLocale,
  slug: string,
  contributionId: string,
): string {
  return localizedPath(
    locale,
    publicCommunityDiscussionPath(slug, contributionId),
  );
}

/** One community address. `all` and an empty query emit nothing. */
export function buildPublicCommunityHref(
  locale: PublicLocale,
  slug: string,
  request: Partial<PublicCommunityViewRequest> = {},
): string {
  return buildListingHref(communityBasePath(locale, slug), {
    q: request.query ?? null,
    kind: request.kind && request.kind !== "all" ? request.kind : null,
    cursor: request.cursor ?? null,
  });
}

/** The same view with one filter removed — the chip's own href. */
export function buildCommunityRemovalHref(
  locale: PublicLocale,
  slug: string,
  request: PublicCommunityViewRequest,
  facet: "q" | "kind",
): string {
  return buildPublicCommunityHref(locale, slug, {
    query: facet === "q" ? "" : request.query,
    kind: facet === "kind" ? "all" : request.kind,
    // Removing a filter returns to the first page of what is left.
    cursor: null,
  });
}

export interface CommunityCountable {
  readonly activeContributionCount: number;
  readonly activeObjectCount: number;
  readonly activeMemberCount: number;
}

export interface CommunityFactLabels {
  readonly journals: string;
  readonly objects: string;
  readonly members: string;
}

export interface CommunityFact {
  readonly key: "journals" | "objects" | "members";
  readonly label: string;
  readonly value: number;
}

/**
 * What this community has, with the zeros left out.
 *
 * The order is the reader's interest, not the schema's: what has been written,
 * what it was written about, and only then how many people are here. A
 * community with nothing yet returns an empty array, and the caller renders
 * structure instead of a row of noughts.
 */
export function communityFacts(
  community: CommunityCountable,
  labels: CommunityFactLabels,
): CommunityFact[] {
  return (
    [
      {
        key: "journals" as const,
        label: labels.journals,
        value: community.activeContributionCount,
      },
      {
        key: "objects" as const,
        label: labels.objects,
        value: community.activeObjectCount,
      },
      {
        key: "members" as const,
        label: labels.members,
        value: community.activeMemberCount,
      },
    ] satisfies CommunityFact[]
  ).filter((fact) => Number.isFinite(fact.value) && fact.value > 0);
}

/**
 * True when this community has published nothing and nobody has filtered it —
 * the one case that earns `empty-first-run` rather than `empty-no-results`
 * (DESIGN.md §5.4).
 *
 * A filtered view of an empty community is still "no results": the reader set
 * something, and what they need is the filters they set and a way to clear
 * them, not an illustration and an invitation to write.
 */
export function isFirstRunCommunity(
  community: { readonly activeContributionCount: number },
  request: PublicCommunityViewRequest,
): boolean {
  return (
    community.activeContributionCount === 0 &&
    isUnfilteredCommunityViewRequest(request)
  );
}
