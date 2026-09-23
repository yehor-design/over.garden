/**
 * The tabs a public profile has, as a vocabulary rather than a component
 * detail (`OVE-450`, `OVE-494`).
 *
 * It lives here, away from the component, because three modules have to agree
 * about it and one of them must not import React: the profile renders the
 * tabs, the route reads `?tab=`, and `lib/interface-route-policy.ts` decides
 * whether that parameter survives the proxy at all. It does not, unless it is
 * on the route's own allow-list — a public address carries the parameters it
 * declares and no others, and a `tab` the proxy had never heard of was
 * silently dropped before the page could read it.
 *
 * **Entries first, then objects** (`OVE-494`): a profile is read the way the
 * feed is, newest writing first, and the objects are the journals that writing
 * belongs to. The "about" tab is gone — the gardener's bio, region and
 * languages are the header now, so a link still carrying `?tab=about` loses
 * the parameter at the proxy and lands on the entries.
 *
 * **There is no `communities` tab, and the absence is deliberate.**
 * `OVE-450`'s acceptance criteria name one, but `community_memberships` has no
 * visibility column: a membership records `active`, `left` or `banned` and
 * nothing about who may see it. Publishing that set on a public profile would
 * publish data no gardener ever marked publishable — the fact of a ban
 * included. That is an owner decision, not an implementation detail, so the
 * tab waits for one rather than being guessed at here.
 */
export const PUBLIC_PROFILE_TAB_IDS = ["entries", "objects"] as const;

export type PublicProfileTabId = (typeof PUBLIC_PROFILE_TAB_IDS)[number];

/**
 * The tab a request asked for.
 *
 * The first one is the default, and a `?tab=` naming anything else is ignored
 * rather than answered with an error — a stale or hand-edited link should land
 * a reader on the gardener's entries, not on a 404.
 */
export function normalizePublicProfileTab(
  value: string | string[] | undefined | null,
): PublicProfileTabId {
  const candidate = Array.isArray(value) ? value[0] : value;
  return PUBLIC_PROFILE_TAB_IDS.find((tab) => tab === candidate) ?? "entries";
}

/**
 * The page of the open tab's list a request asked for: `1` for anything that
 * is not a page number, the same shape and ceiling the interface route policy
 * lets through (`page`, 1–1000).
 */
export function normalizePublicProfilePage(
  value: string | string[] | undefined | null,
): number {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !/^[1-9][0-9]{0,3}$/u.test(candidate)) return 1;
  const page = Number(candidate);
  return page <= 1_000 ? page : 1;
}

/** The address of one tab of one profile — shareable, and reloadable into. */
export function publicProfileTabHref(
  basePath: string,
  tab: PublicProfileTabId,
  hash?: string,
) {
  return publicProfileListHref(basePath, tab, 1, hash);
}

/**
 * The address of one page of one of a profile's lists.
 *
 * The first tab and the first page are the page itself, so each is absent
 * rather than written: absent means unset, here as everywhere else.
 */
export function publicProfileListHref(
  basePath: string,
  tab: PublicProfileTabId,
  page: number,
  hash?: string,
) {
  const params = new URLSearchParams();
  if (tab !== PUBLIC_PROFILE_TAB_IDS[0]) params.set("tab", tab);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `${basePath}${query ? `?${query}` : ""}${hash ?? ""}`;
}
