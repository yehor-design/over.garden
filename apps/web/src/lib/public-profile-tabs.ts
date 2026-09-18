/**
 * The tabs a public profile has, as a vocabulary rather than a component
 * detail (`OVE-450`).
 *
 * It lives here, away from the component, because three modules have to agree
 * about it and one of them must not import React: the profile renders the
 * tabs, the route reads `?tab=`, and `lib/interface-route-policy.ts` decides
 * whether that parameter survives the proxy at all. It does not, unless it is
 * on the route's own allow-list — a public address carries the parameters it
 * declares and no others, and a `tab` the proxy had never heard of was
 * silently dropped before the page could read it.
 *
 * **There is no `communities` tab, and the absence is deliberate.**
 * `OVE-450`'s acceptance criteria name one, but `community_memberships` has no
 * visibility column: a membership records `active`, `left` or `banned` and
 * nothing about who may see it. Publishing that set on a public profile would
 * publish data no gardener ever marked publishable — the fact of a ban
 * included. That is an owner decision, not an implementation detail, so the
 * tab waits for one rather than being guessed at here.
 */
export const PUBLIC_PROFILE_TAB_IDS = ["objects", "entries", "about"] as const;

export type PublicProfileTabId = (typeof PUBLIC_PROFILE_TAB_IDS)[number];

/**
 * The tab a request asked for.
 *
 * The first one is the default, and a `?tab=` naming anything else is ignored
 * rather than answered with an error — a stale or hand-edited link should land
 * a reader on the gardener's objects, not on a 404.
 */
export function normalizePublicProfileTab(
  value: string | string[] | undefined | null,
): PublicProfileTabId {
  const candidate = Array.isArray(value) ? value[0] : value;
  return PUBLIC_PROFILE_TAB_IDS.find((tab) => tab === candidate) ?? "objects";
}

/** The address of one tab of one profile — shareable, and reloadable into. */
export function publicProfileTabHref(
  basePath: string,
  tab: PublicProfileTabId,
  hash?: string,
) {
  // The first tab is the page itself, so it is absent rather than written:
  // absent means unset, here as everywhere else.
  const query = tab === PUBLIC_PROFILE_TAB_IDS[0] ? "" : `?tab=${tab}`;
  return `${basePath}${query}${hash ?? ""}`;
}
