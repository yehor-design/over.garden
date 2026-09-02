import { createHash } from "node:crypto";

export const ADMIN_MENU_VISIBILITY_RECEIPT_VERSION =
  "ove338.adminMenuVisibility.v1";
export const ADMIN_ROLE_RESOLUTION_DEADLINE_MS = 250;
export const ADMIN_MENU_LOCALES = ["uk", "bg", "ru"] as const;
export const EXPECTED_OPERATOR_MENU_LINKS = [
  "/account/communities",
  "/account/moderation/comments",
  "/garden/catalog/curation",
  "/garden/privacy/erasure-requests",
] as const;
export const EXPECTED_ACCOUNT_MODERATION_PATHS = [
  "/account/communities",
  "/account/communities/observation-and-care",
  "/account/moderation/comments",
] as const;
export const RETIRED_ADMIN_PATH_PROBES = [
  "/admin",
  "/admin/",
  "/admin/communities",
  "/admin/communities/observation-and-care",
  "/admin/moderation/comments",
  "/admin/retired-descendant",
  "/bg/admin",
  "/ru/admin/communities",
  "/%61dmin/communities",
  "/admin%2Fmoderation%2Fcomments",
  "/admin%252Fcommunities",
] as const;

export type AdminMenuActorClass =
  | "sealed_owner"
  | "guest"
  | "ordinary"
  | "social_linked"
  | "non_sealed"
  | "missing"
  | "denied"
  | "timed_out"
  | "cancelled";
export type AdminMenuAccessStatus =
  | "allowed"
  | "denied"
  | "timed_out"
  | "cancelled";

export interface AdminMenuContractInput {
  actorClass: AdminMenuActorClass;
  accessStatus: AdminMenuAccessStatus;
  links: readonly string[];
  localeLinkSets: Readonly<Record<string, readonly string[]>>;
  retiredRouteStatuses: Readonly<Record<string, number>>;
  reachableAccountPaths: readonly string[];
  queueReadCount: number;
  mutationCount: number;
  durationMs: number;
  evidence: unknown;
}

export interface AdminMenuContractReceipt {
  version: typeof ADMIN_MENU_VISIBILITY_RECEIPT_VERSION;
  status: "aligned" | "contract_drift" | "timed_out" | "cancelled";
  actorClass: AdminMenuActorClass;
  linkCount: number;
  localeCount: number;
  retiredPathCount: number;
  accountPathCount: number;
  queueReadCount: number;
  mutationCount: number;
  durationMs: number;
  digest: string;
  violations: string[];
}

const FORBIDDEN_EVIDENCE_FIELD =
  /^(?:account|cookie|credential|email|environment|identity|ip|mediaKey|password|private|provider|request|session|token|userAgent|userId)$/i;

export function evaluateAdminMenuContract(
  input: AdminMenuContractInput,
): AdminMenuContractReceipt {
  const violations: string[] = [];
  const owner = input.actorClass === "sealed_owner";

  if (
    owner ? input.accessStatus !== "allowed" : input.accessStatus === "allowed"
  ) {
    violations.push("actor_access_mismatch");
  }

  const expectedLinks = owner ? EXPECTED_OPERATOR_MENU_LINKS : [];
  if (!sameValues(input.links, expectedLinks)) {
    violations.push("operator_link_set_mismatch");
  }
  for (const locale of ADMIN_MENU_LOCALES) {
    if (!sameValues(input.localeLinkSets[locale] ?? [], expectedLinks)) {
      violations.push("locale_link_set_mismatch");
      break;
    }
  }

  const expectedAccountPaths = owner ? EXPECTED_ACCOUNT_MODERATION_PATHS : [];
  if (!sameValues(input.reachableAccountPaths, expectedAccountPaths)) {
    violations.push("account_path_set_mismatch");
  }
  if (!owner && (input.queueReadCount !== 0 || input.mutationCount !== 0)) {
    violations.push("unauthorized_effect");
  }

  for (const path of RETIRED_ADMIN_PATH_PROBES) {
    if (input.retiredRouteStatuses[path] !== 404) {
      violations.push("retired_admin_path_not_404");
      break;
    }
  }
  if (
    !Number.isFinite(input.durationMs) ||
    input.durationMs < 0 ||
    input.durationMs > ADMIN_ROLE_RESOLUTION_DEADLINE_MS
  ) {
    violations.push("role_resolution_deadline");
  }

  if (hasForbiddenEvidenceField(input.evidence)) {
    violations.push("forbidden_evidence_field");
  }

  const uniqueViolations = [...new Set(violations)].sort();
  const semantic = {
    version: ADMIN_MENU_VISIBILITY_RECEIPT_VERSION,
    actorClass: input.actorClass,
    accessStatus: input.accessStatus,
    links: [...input.links],
    localeLinkSets: Object.fromEntries(
      ADMIN_MENU_LOCALES.map((locale) => [
        locale,
        [...(input.localeLinkSets[locale] ?? [])],
      ]),
    ),
    retiredRouteClasses: RETIRED_ADMIN_PATH_PROBES.map((path) => ({
      path,
      status: input.retiredRouteStatuses[path] ?? null,
    })),
    reachableAccountPaths: [...input.reachableAccountPaths],
    queueReadCount: input.queueReadCount,
    mutationCount: input.mutationCount,
    violations: uniqueViolations,
  };

  return {
    version: ADMIN_MENU_VISIBILITY_RECEIPT_VERSION,
    status:
      uniqueViolations.length > 0
        ? "contract_drift"
        : input.accessStatus === "timed_out" ||
            input.accessStatus === "cancelled"
          ? input.accessStatus
          : "aligned",
    actorClass: input.actorClass,
    linkCount: input.links.length,
    localeCount: ADMIN_MENU_LOCALES.length,
    retiredPathCount: RETIRED_ADMIN_PATH_PROBES.length,
    accountPathCount: input.reachableAccountPaths.length,
    queueReadCount: input.queueReadCount,
    mutationCount: input.mutationCount,
    durationMs: Math.ceil(input.durationMs),
    digest: createHash("sha256").update(JSON.stringify(semantic)).digest("hex"),
    violations: uniqueViolations,
  };
}

export interface AdminRoleResolutionCheck {
  result: Promise<{ status: AdminMenuAccessStatus }>;
  getStatus(): "evaluating" | AdminMenuAccessStatus;
  cancel(): boolean;
  controls: readonly ["Retry sign-in button", "Continue to garden link"];
}

export function createAdminRoleResolutionCheck(
  resolveRole: () => Promise<
    Extract<AdminMenuAccessStatus, "allowed" | "denied">
  >,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): AdminRoleResolutionCheck {
  let status: "evaluating" | AdminMenuAccessStatus = "evaluating";
  let finish: ((result: { status: AdminMenuAccessStatus }) => void) | undefined;
  const timeoutMs = Math.min(
    Math.max(options.timeoutMs ?? ADMIN_ROLE_RESOLUTION_DEADLINE_MS, 1),
    ADMIN_ROLE_RESOLUTION_DEADLINE_MS,
  );
  const result = new Promise<{ status: AdminMenuAccessStatus }>((resolve) => {
    finish = resolve;
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const settle = (next: AdminMenuAccessStatus) => {
    if (status !== "evaluating") return false;
    status = next;
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
    finish?.({ status: next });
    return true;
  };
  const cancel = () => settle("cancelled");

  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) {
    cancel();
  } else {
    timer = setTimeout(() => settle("timed_out"), timeoutMs);
    void Promise.resolve()
      .then(resolveRole)
      .then(
        (resolved) => settle(resolved),
        () => settle("denied"),
      );
  }

  return {
    result,
    getStatus: () => status,
    cancel,
    controls: ["Retry sign-in button", "Continue to garden link"],
  };
}

function sameValues(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function hasForbiddenEvidenceField(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasForbiddenEvidenceField);
  return Object.entries(value).some(
    ([key, child]) =>
      FORBIDDEN_EVIDENCE_FIELD.test(key) || hasForbiddenEvidenceField(child),
  );
}
