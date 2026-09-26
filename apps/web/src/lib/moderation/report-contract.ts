import {
  publicJournalEntryPath,
  publicObjectPassportPath,
  publicProfileBasePath,
  publicTopicPath,
} from "@/lib/garden/public-paths";
import { stripLocalePrefix } from "@/lib/public-localization";

/**
 * The complaint procedure's contract (ADR-0038 D5, `OVE-526`): what can be
 * reported, why, what a report must carry, and the grounds a decision names.
 * Pure, so the form, the server and the owner's list agree on one list.
 */

export const REPORT_TARGET_KINDS = [
  "entry",
  "profile",
  "object",
  "topic",
] as const;
export type ReportTargetKind = (typeof REPORT_TARGET_KINDS)[number];

/** The short list the reporter picks from (the owner approves the words). */
export const REPORT_REASONS = [
  "spam",
  "harassment",
  "personal_data",
  "animal_cruelty",
  "copyright",
  "illegal",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/**
 * What a removal rests on: the terms' section, or the law. The ids are the
 * terms' own section ids, so the statement of reasons links the section.
 */
export const REPORT_DECISION_GROUNDS = [
  "terms-content",
  "terms-photo-licence",
  "terms-account",
  "law",
] as const;
export type ReportDecisionGround = (typeof REPORT_DECISION_GROUNDS)[number];

export const REPORT_DECISIONS = ["kept", "removed"] as const;
export type ReportDecision = (typeof REPORT_DECISIONS)[number];

export const REPORT_EXPLANATION_MIN = 10;
export const REPORT_EXPLANATION_MAX = 2000;
export const REPORT_NAME_MAX = 120;
export const REPORT_EMAIL_MAX = 254;
export const REPORT_FACTS_MAX = 2000;

/** How many reports one network address may send (the public-form limit). */
export const REPORT_RATE_LIMIT = { perHour: 5, perDay: 20 } as const;

export const REPORT_PATH = "/report";

/** Where the owner decides (beside comment moderation). */
export const OWNER_REPORTS_PATH = "/account/moderation/reports";

/** The report form for the page at `address`. */
export function reportHref(address: string): string {
  return `${REPORT_PATH}?address=${encodeURIComponent(address)}`;
}

/**
 * The shape of a reportable address, before anything is looked up: an entry
 * `/@handle/post/7`, an object passport `/@handle/objects/slug`, a profile
 * `/@handle`, a tag page `/topics/slug` — with or without a language prefix.
 */
export type ReportAddress =
  | { kind: "entry"; handle: string; entryNumber: number }
  | { kind: "object"; handle: string; slug: string }
  | { kind: "profile"; handle: string }
  | { kind: "topic"; slug: string };

const HANDLE = "[a-z0-9_]{1,40}";
const SLUG = "[a-z0-9-]{1,120}";

export function parseReportAddress(raw: unknown): ReportAddress | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) {
    return null;
  }
  let pathname: string;
  try {
    const url = new URL(raw, "https://over.garden");
    if (url.origin !== "https://over.garden") return null;
    pathname = decodeURIComponent(url.pathname).toLowerCase();
  } catch {
    return null;
  }
  const { path } = stripLocalePrefix(pathname);
  const entry = new RegExp(`^/@(${HANDLE})/post/([1-9][0-9]{0,8})$`, "u").exec(
    path,
  );
  if (entry) {
    return { kind: "entry", handle: entry[1]!, entryNumber: Number(entry[2]) };
  }
  const object = new RegExp(`^/@(${HANDLE})/objects/(${SLUG})$`, "u").exec(
    path,
  );
  if (object) return { kind: "object", handle: object[1]!, slug: object[2]! };
  const profile = new RegExp(`^/@(${HANDLE})$`, "u").exec(path);
  if (profile) return { kind: "profile", handle: profile[1]! };
  const topic = new RegExp(`^/topics/(${SLUG})$`, "u").exec(path);
  if (topic) return { kind: "topic", slug: topic[1]! };
  return null;
}

/** The address a report records: the canonical path, without its language. */
export function reportAddressPath(address: ReportAddress): string {
  switch (address.kind) {
    case "entry":
      return publicJournalEntryPath(address.handle, address.entryNumber);
    case "object":
      return publicObjectPassportPath(address.handle, address.slug);
    case "profile":
      return publicProfileBasePath(address.handle);
    case "topic":
      return publicTopicPath(address.slug);
  }
}

export interface ReportFormInput {
  address: ReportAddress;
  reason: ReportReason;
  explanation: string;
  name: string;
  email: string;
}

export type ReportFormField =
  | "address"
  | "reason"
  | "explanation"
  | "name"
  | "email"
  | "goodFaith";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;

/** Every field the form asks for, checked the same way on both sides. */
export function parseReportForm(
  fields: Record<string, unknown>,
):
  | { ok: true; input: ReportFormInput }
  | { ok: false; errors: ReportFormField[] } {
  const errors: ReportFormField[] = [];
  const address = parseReportAddress(fields.address);
  if (!address) errors.push("address");
  const reason = fields.reason;
  if (
    typeof reason !== "string" ||
    !(REPORT_REASONS as readonly string[]).includes(reason)
  ) {
    errors.push("reason");
  }
  const explanation = text(fields.explanation);
  if (
    explanation.length < REPORT_EXPLANATION_MIN ||
    explanation.length > REPORT_EXPLANATION_MAX
  ) {
    errors.push("explanation");
  }
  const name = text(fields.name);
  if (name.length < 1 || name.length > REPORT_NAME_MAX) errors.push("name");
  const email = text(fields.email).toLowerCase();
  if (email.length > REPORT_EMAIL_MAX || !EMAIL.test(email))
    errors.push("email");
  if (fields.goodFaith !== "on" && fields.goodFaith !== true) {
    errors.push("goodFaith");
  }
  if (errors.length > 0 || !address) return { ok: false, errors };
  return {
    ok: true,
    input: {
      address,
      reason: reason as ReportReason,
      explanation,
      name,
      email,
    },
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
