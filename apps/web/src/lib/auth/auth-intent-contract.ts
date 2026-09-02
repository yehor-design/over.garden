import { parseInternalReturnPath } from "@/lib/navigation/internal-return-path";
import { normalizePublicJournalSlug } from "@/lib/garden/public-journal-slug";

export const AUTH_INTENT_ACTIONS = [
  "comment",
  "bookmark",
  "follow",
  "report",
  "block",
  "claim",
  "create_object",
  "create_entry",
  "save",
  "publish",
] as const;

export type AuthIntentAction = (typeof AUTH_INTENT_ACTIONS)[number];
export type AuthIntentTargetKind =
  | "journal"
  | "object"
  | "profile"
  | "collection"
  | "contribution";

export interface AuthIntentTarget {
  kind: AuthIntentTargetKind;
  ref: string;
}

export interface AuthIntentDraft {
  action: AuthIntentAction;
  returnTo: string;
  target?: AuthIntentTarget;
  control?: string;
}

export interface AuthIntentPayload extends AuthIntentDraft {
  version: 1;
  issuedAt: number;
  expiresAt: number;
}

export class AuthIntentContractError extends Error {
  constructor() {
    super("Invalid authentication intent.");
    this.name = "AuthIntentContractError";
  }
}

const ACTIONS = new Set<string>(AUTH_INTENT_ACTIONS);
const TARGET_KINDS = new Set<AuthIntentTargetKind>([
  "journal",
  "object",
  "profile",
  "collection",
  "contribution",
]);
const QUERY_KEYS = new Set([
  "q",
  "topic",
  "cursor",
  "kind",
  "tab",
  "page",
  "sort",
  "engagement",
  "source",
  "filter",
  "unread",
  "view",
  "entry",
  "wishlist",
  "saveProgress",
]);
const ROUTE_PATTERNS = [
  /^\/$/,
  /^\/(?:uk|bg|ru)$/,
  /^\/variety\/[a-z0-9][a-z0-9-]{0,95}$/,
  /^\/lineage\/objects\/[0-9a-f-]{36}$/,
  /^\/@[a-z0-9_]{2,40}$/,
  /^\/(?:uk|bg|ru)\/@[a-z0-9_]{2,40}$/,
  /^\/(?:(?:uk|bg|ru)\/)?topics\/[a-z0-9][a-z0-9-]{0,95}$/,
  /^\/(?:(?:uk|bg|ru)\/)?communities\/[a-z0-9][a-z0-9-]{0,95}$/,
  /^\/(?:(?:uk|bg|ru)\/)?communities\/[a-z0-9][a-z0-9-]{0,95}\/discussions\/[0-9a-f-]{36}$/,
  /^\/(?:uk|bg|ru)\/(?:objects|journals|knowledge|feed|notifications|bookmarks|wishlist)$/,
  /^\/garden$/,
  /^\/garden\/objects\/[0-9a-f-]{36}$/,
  /^\/garden\/(?:profile|lineage\/claims|lineage\/invitations\/claim)$/,
] as const;
const ACTION_TARGET_KINDS: Record<
  AuthIntentAction,
  readonly AuthIntentTargetKind[] | null
> = {
  comment: ["journal", "object", "collection", "contribution"],
  bookmark: ["journal", "object", "profile", "collection"],
  follow: ["object", "profile", "collection"],
  report: ["journal", "object", "profile", "collection", "contribution"],
  block: ["journal", "object", "profile", "collection", "contribution"],
  claim: ["object"],
  create_object: null,
  create_entry: null,
  save: ["object", "journal"],
  publish: ["journal"],
};
const REQUIRED_TARGET_ACTIONS = new Set<AuthIntentAction>([
  "comment",
  "bookmark",
  "follow",
  "report",
  "block",
]);
const ACTION_ANCHORS: Record<AuthIntentAction, string> = {
  comment: "comments",
  bookmark: "engagement-bookmark",
  follow: "lineage-follow",
  report: "profile-report",
  block: "profile-block",
  claim: "lineage-claim",
  create_object: "first-entry-composer",
  create_entry: "first-entry-composer",
  save: "first-entry-composer",
  publish: "entry-publish",
};
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,95}$/;
const HANDLE_PATTERN = /^[a-z0-9_]{2,40}$/;
const SAFE_QUERY_VALUE_PATTERN = /^[A-Za-z0-9._~-]+$/;
const SAFE_SEARCH_QUERY_PATTERN = /^[\p{L}\p{N}\p{M}\p{Zs}.'’_-]+$/u;
const CONTROL_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;

export function normalizeAuthIntentDraft(input: unknown): AuthIntentDraft {
  if (!input || typeof input !== "object") throw new AuthIntentContractError();

  const record = input as Record<string, unknown>;
  const action = normalizeAction(record.action);
  const returnTo = normalizeReturnTo(record.returnTo);
  const target = normalizeTarget(record.target);
  const control = normalizeControl(record.control);
  const compatibleKinds = ACTION_TARGET_KINDS[action];

  if (REQUIRED_TARGET_ACTIONS.has(action) && !target) {
    throw new AuthIntentContractError();
  }
  if (target && (!compatibleKinds || !compatibleKinds.includes(target.kind))) {
    throw new AuthIntentContractError();
  }

  return {
    action,
    returnTo,
    ...(target ? { target } : {}),
    ...(control ? { control } : {}),
  };
}

export function buildAuthIntentResumeHref(
  intent: Pick<AuthIntentDraft, "action" | "returnTo" | "control">,
): string {
  const action = normalizeAction(intent.action);
  const returnTo = normalizeReturnTo(intent.returnTo);
  const control = normalizeControl(intent.control);
  const url = new URL(returnTo, "https://over.garden");

  url.searchParams.set("authIntent", action);
  if (control) url.searchParams.set("authControl", control);
  url.hash = buildAuthIntentResumeAnchor(action, url.pathname, control);

  return `${url.pathname}${url.search}${url.hash}`;
}

function buildAuthIntentResumeAnchor(
  action: AuthIntentAction,
  pathname: string,
  control?: string | null,
) {
  if (
    action === "save" &&
    /^\/garden\/objects\/[0-9a-f-]{36}$/.test(pathname)
  ) {
    return "follow-up-composer";
  }

  return buildAuthIntentAnchor(action, control);
}

export function buildAuthIntentAnchor(
  action: AuthIntentAction,
  control?: string | null,
) {
  const normalizedAction = normalizeAction(action);
  const normalizedControl = normalizeControl(control ?? undefined);
  return normalizedControl
    ? `${ACTION_ANCHORS[normalizedAction]}-${normalizedControl}`
    : ACTION_ANCHORS[normalizedAction];
}

export function normalizeAuthIntentResumeAction(
  value: string | string[] | undefined,
): AuthIntentAction | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" && ACTIONS.has(candidate)
    ? (candidate as AuthIntentAction)
    : null;
}

export function normalizeAuthIntentResumeControl(
  value: string | string[] | undefined,
): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  try {
    return normalizeControl(candidate) ?? null;
  } catch {
    return null;
  }
}

function normalizeAction(value: unknown): AuthIntentAction {
  if (typeof value !== "string" || !ACTIONS.has(value)) {
    throw new AuthIntentContractError();
  }
  return value as AuthIntentAction;
}

function normalizeTarget(value: unknown): AuthIntentTarget | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== "object") throw new AuthIntentContractError();

  const record = value as Record<string, unknown>;
  if (
    typeof record.kind !== "string" ||
    !TARGET_KINDS.has(record.kind as AuthIntentTargetKind) ||
    typeof record.ref !== "string"
  ) {
    throw new AuthIntentContractError();
  }

  const kind = record.kind as AuthIntentTargetKind;
  const rawRef = record.ref.trim();
  if (kind === "journal") {
    const ref = normalizePublicJournalSlug(rawRef);
    if (!ref) throw new AuthIntentContractError();
    return { kind, ref };
  }

  const ref = rawRef.toLowerCase();
  const valid =
    kind === "object" || kind === "contribution"
      ? UUID_PATTERN.test(ref)
      : kind === "profile"
        ? HANDLE_PATTERN.test(ref.replace(/^@/, ""))
        : SLUG_PATTERN.test(ref);

  if (!valid) throw new AuthIntentContractError();

  return {
    kind,
    ref: kind === "profile" ? ref.replace(/^@/, "") : ref,
  };
}

function normalizeControl(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new AuthIntentContractError();

  const control = value.trim().toLowerCase();
  if (!CONTROL_PATTERN.test(control)) throw new AuthIntentContractError();
  return control;
}

function normalizeReturnTo(value: unknown): string {
  let candidate: string;
  try {
    candidate = parseInternalReturnPath(value);
  } catch {
    throw new AuthIntentContractError();
  }

  let url: URL;
  try {
    url = new URL(candidate, "https://over.garden");
  } catch {
    throw new AuthIntentContractError();
  }

  if (
    url.origin !== "https://over.garden" ||
    !isAllowedReturnPath(url.pathname)
  ) {
    throw new AuthIntentContractError();
  }

  for (const [key, queryValue] of url.searchParams) {
    const maximumLength = key === "cursor" ? 512 : key === "q" ? 100 : 96;
    const safeValue =
      key === "q"
        ? SAFE_SEARCH_QUERY_PATTERN.test(queryValue)
        : SAFE_QUERY_VALUE_PATTERN.test(queryValue);
    if (
      !QUERY_KEYS.has(key) ||
      queryValue.length === 0 ||
      queryValue.length > maximumLength ||
      !safeValue
    ) {
      throw new AuthIntentContractError();
    }
  }

  if (
    url.hash &&
    !Object.values(ACTION_ANCHORS).includes(url.hash.slice(1)) &&
    !/^[a-z0-9][a-z0-9-]{0,63}$/.test(url.hash.slice(1))
  ) {
    throw new AuthIntentContractError();
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function isAllowedReturnPath(pathname: string) {
  return (
    ROUTE_PATTERNS.some((pattern) => pattern.test(pathname)) ||
    isPublicJournalReturnPath(pathname)
  );
}

function isPublicJournalReturnPath(pathname: string) {
  const match = /^\/(?:(?:uk|bg|ru)\/)?journal\/([^/]+)$/.exec(pathname);
  return Boolean(match && normalizePublicJournalSlug(match[1]));
}
