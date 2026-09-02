export const OVE332_UNRESOLVED_AUTHORIZATION_VERSION =
  "ove332.unresolvedClass.v1" as const;

export const OVE332_UNRESOLVED_CLASSES = [
  "session_unresolved",
  "ownership_unresolved",
  "provider_link_unverified",
  "weak_secret",
  "proxy_ambiguous",
] as const;

export const OVE332_AUTHORIZATION_OWNERS = [
  "auth_secret",
  "explicit_google_linking",
  "session_presence",
  "session_boundary",
  "account_methods",
  "interface_route_ownership",
  "public_profile_proxy",
  "responsive_accessibility",
] as const;

export const OVE332_CONVERTIBLE_AUTHORIZATION_OWNERS = [
  "auth_secret",
  "explicit_google_linking",
  "session_presence",
  "session_boundary",
  "account_methods",
  "interface_route_ownership",
  "public_profile_proxy",
] as const;

export type Ove332UnresolvedClass = (typeof OVE332_UNRESOLVED_CLASSES)[number];
export type Ove332AuthorizationOwner =
  (typeof OVE332_AUTHORIZATION_OWNERS)[number];
export type Ove332ConvertibleAuthorizationOwner =
  (typeof OVE332_CONVERTIBLE_AUTHORIZATION_OWNERS)[number];

const EXPECTED_CLASS_BY_OWNER = {
  auth_secret: "weak_secret",
  explicit_google_linking: "provider_link_unverified",
  session_presence: "session_unresolved",
  session_boundary: "session_unresolved",
  account_methods: "ownership_unresolved",
  interface_route_ownership: "ownership_unresolved",
  public_profile_proxy: "proxy_ambiguous",
} as const satisfies Record<
  Ove332ConvertibleAuthorizationOwner,
  Ove332UnresolvedClass
>;

export interface Ove332UnresolvedServeReceipt {
  readonly version: typeof OVE332_UNRESOLVED_AUTHORIZATION_VERSION;
  readonly status: "served_unresolved";
  readonly owner: Ove332ConvertibleAuthorizationOwner;
  readonly unresolvedClass: Ove332UnresolvedClass;
}

export interface Ove332UnresolvedServeCount {
  readonly owner: Ove332ConvertibleAuthorizationOwner;
  readonly unresolvedClass: Ove332UnresolvedClass;
  readonly count: number;
}

const servedCounts = new Map<string, number>();

export function expectedUnresolvedClassForOwner(
  owner: Ove332ConvertibleAuthorizationOwner,
): Ove332UnresolvedClass {
  return EXPECTED_CLASS_BY_OWNER[owner];
}

export function recordUnresolvedAuthorizationServe(
  owner: Ove332ConvertibleAuthorizationOwner,
  unresolvedClass: Ove332UnresolvedClass,
): Ove332UnresolvedServeReceipt {
  if (EXPECTED_CLASS_BY_OWNER[owner] !== unresolvedClass) {
    throw new Error("OVE-332 unresolved authorization owner class mismatch.");
  }

  const key = `${owner}:${unresolvedClass}`;
  servedCounts.set(key, (servedCounts.get(key) ?? 0) + 1);
  return Object.freeze({
    version: OVE332_UNRESOLVED_AUTHORIZATION_VERSION,
    status: "served_unresolved" as const,
    owner,
    unresolvedClass,
  });
}

export function getUnresolvedAuthorizationServeCounts(): readonly Ove332UnresolvedServeCount[] {
  return Object.freeze(
    [...servedCounts.entries()]
      .map(([key, count]) => {
        const [owner, unresolvedClass] = key.split(":") as [
          Ove332ConvertibleAuthorizationOwner,
          Ove332UnresolvedClass,
        ];
        return Object.freeze({ owner, unresolvedClass, count });
      })
      .sort((left, right) => left.owner.localeCompare(right.owner)),
  );
}

export function resetUnresolvedAuthorizationServeCountsForTests() {
  servedCounts.clear();
}

export function resolveUnresolvedAuthorizationDecision(input: {
  owner: Ove332AuthorizationOwner;
  resolution: "same_user" | "another_user" | "unresolved";
}):
  | { readonly status: "allowed"; readonly owner: Ove332AuthorizationOwner }
  | { readonly status: "refused"; readonly owner: Ove332AuthorizationOwner }
  | {
      readonly status: "preserved";
      readonly owner: "responsive_accessibility";
    }
  | Ove332UnresolvedServeReceipt {
  if (input.resolution === "same_user") {
    return Object.freeze({ status: "allowed" as const, owner: input.owner });
  }
  if (input.resolution === "another_user") {
    return Object.freeze({ status: "refused" as const, owner: input.owner });
  }
  if (input.owner === "responsive_accessibility") {
    return Object.freeze({
      status: "preserved" as const,
      owner: "responsive_accessibility" as const,
    });
  }

  return recordUnresolvedAuthorizationServe(
    input.owner,
    expectedUnresolvedClassForOwner(input.owner),
  );
}
