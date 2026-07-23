export const FIRST_PUBLICATION_DISCLOSURE_VERSION = "first-publication-v4";
export const ERASURE_REQUEST_INTAKE_VERSION = "erasure-request-mvp-v1";

export const SUPPORT_EMAIL = "support.overgarden@gmail.com";

export const MVP_LEGAL_COPY_STATUS =
  "founder_approved_mvp_lawyer_review_deferred" as const;

export const MVP_LEGAL_COPY_STATUS_LABEL =
  "Founder-approved MVP copy; lawyer review deferred";

export const MVP_LEGAL_COPY_REVIEW_NOTE =
  "This MVP notice is written/generated internally and approved by the founder for launch learning. It is not final lawyer-approved public policy.";

export const MVP_RETENTION_RULES = [
  {
    title: "Original photo uploads",
    summary:
      "Private quarantine originals are deleted after successful processing or after 7 failed-processing days.",
    developerBoundary:
      "Quarantine keys and original object keys stay out of public HTML, search documents, analytics, support evidence, and operator readouts.",
  },
  {
    title: "Public photo derivatives",
    summary:
      "Server-cleaned public derivatives stay available while the related public entry is active and are removed from public surfaces after archive or erasure.",
    developerBoundary:
      "Public pages may render derivative URLs only; erasure removes OverGarden-controlled objects when their keys are still known.",
  },
  {
    title: "Operator audit logs",
    summary:
      "Operator audit logs are kept for 1 year so sensitive account and erasure actions can be reviewed.",
    developerBoundary:
      "Audit evidence must use bounded ids, roles, actions, reasons, and timestamps, not private content or raw request metadata.",
  },
  {
    title: "Erasure handling evidence",
    summary:
      "Erasure handling evidence is kept for 1 year to prove the request path, dry-run review, approval, and handled outcome.",
    developerBoundary:
      "Evidence can show status, request reference, data-class counts, and approval checkpoints only.",
  },
  {
    title: "Analytics events",
    summary:
      "First-party product analytics events are retained for up to 13 months. Consented Google Tag Manager / Google Analytics page measurement and Microsoft Clarity session insights can run on authored public, legal, and support pages; consented Meta Ads measurement can run only through its separate marketing opt-in and allowlisted event classes.",
    developerBoundary:
      "Analytics and marketing payloads must remain enum/bounded and must not include journal text, exact location, raw URLs, referrers, contact data, private garden paths, admin paths, media keys, auth callback data, account identifiers, IP address, user-agent values, provider cookies, Clarity recordings, or Clarity session identifiers.",
  },
] as const;

export const MVP_OPERATOR_EVIDENCE_FORBIDDEN_FIELDS = [
  "private journal text",
  "precise location",
  "private email addresses",
  "IP addresses",
  "user agents",
  "media keys",
  "raw tokens",
  "provider cookies",
] as const;

export const MVP_LEGAL_COPY_BOUNDARIES = [
  "Lawyer review is deferred until after MVP learning; material wording changes must create new disclosure versions.",
  "This policy does not add monetization terms.",
  "Legal, support, erasure, and diagnostic pages remain unlisted for search engines unless a later SEO policy deliberately promotes them.",
] as const;

export const FIRST_PUBLICATION_DISCLOSURE_LINES = [
  "Publishing makes this journal entry publicly readable by visitors who can reach the public page and by OverGarden public surfaces that reference it.",
  "Useful first-party editorial, guide, answer, and landing pages can be indexed for the MVP; thin or unsafe user-generated surfaces stay out of sitemaps unless explicit promotion rules allow indexing.",
  "Precise location is not collected or shown; only supported coarse regions can appear when you choose region visibility.",
  "Original photos stay in private processing storage and are deleted after successful processing or after 7 failed-processing days; public pages can show only server-cleaned copies.",
  "You can archive a public entry so its old public page stops showing journal text, leaves public discovery surfaces, and is queued for public search removal.",
  "Search-engine, crawler, or AI copies outside OverGarden are removal best-effort only.",
  `For privacy or support questions, contact ${SUPPORT_EMAIL}.`,
] as const;

export const ERASURE_REQUEST_ACKNOWLEDGEMENT_LINES = [
  "Submitting this request records an operator-reviewed intake row for account data erasure or anonymization.",
  "No account, journal entry, media object, search document, or analytics row is deleted automatically by this form.",
  "An operator can review a non-destructive dry-run preview of affected data classes before any maintainer-approved destructive workflow.",
  "An operator can move the request through submitted, reviewing, and handled statuses without reading private journal text.",
  "A maintainer-approved operator can execute irreversible erasure or anonymization only after dry-run review and request-specific approval.",
  "Archive removes public OverGarden surfaces first; approved erasure then deletes or anonymizes current-schema account, garden, journal, media, analytics, catalog-provisional, and search-job references where OverGarden controls them.",
  "Search-engine, crawler, or AI copies outside OverGarden are removal best-effort only.",
  `For privacy or support questions, contact ${SUPPORT_EMAIL}.`,
] as const;

export type ErasureRequestStatusCopyKey =
  | "submitted"
  | "reviewing"
  | "handled"
  | "canceled";

export type ErasureRequestHandledStatusCopyKey =
  | "completed"
  | "cleanup_pending"
  | "declined"
  | "duplicate"
  | "needs_identity_verification";

export const ERASURE_REQUEST_STATUS_COPY: Record<
  ErasureRequestStatusCopyKey,
  { label: string; description: string; isOpen: boolean }
> = {
  submitted: {
    label: "Submitted",
    description:
      "The request has been received and is waiting for operator review.",
    isOpen: true,
  },
  reviewing: {
    label: "Under operator review",
    description:
      "The operator has started review. This still does not automatically delete or anonymize data.",
    isOpen: true,
  },
  handled: {
    label: "Handled",
    description:
      "The operator has recorded an outcome. The handled status below explains what happened next.",
    isOpen: false,
  },
  canceled: {
    label: "Canceled",
    description:
      "The request is no longer active. You can submit a new request if you still need review.",
    isOpen: false,
  },
};

export const ERASURE_REQUEST_HANDLED_STATUS_OPTIONS = [
  {
    value: "completed",
    label: "Completed",
    description:
      "Operator marked the request handled after maintainer-approved erasure or anonymization work.",
  },
  {
    value: "cleanup_pending",
    label: "Storage cleanup pending",
    description:
      "Database identity erasure committed; OverGarden-controlled media object deletion is still finishing.",
  },
  {
    value: "declined",
    label: "Declined",
    description:
      "Operator declined the request and must communicate the reason through the support process.",
  },
  {
    value: "duplicate",
    label: "Duplicate",
    description:
      "Operator found that another active or recently handled request already covers this request.",
  },
  {
    value: "needs_identity_verification",
    label: "Needs identity verification",
    description:
      "Operator cannot proceed until the requester is verified through the support process.",
  },
] as const satisfies ReadonlyArray<{
  value: ErasureRequestHandledStatusCopyKey;
  label: string;
  description: string;
}>;

export function getErasureRequestStatusCopy(
  status: string,
  handledStatus: string | null,
) {
  const statusCopy =
    ERASURE_REQUEST_STATUS_COPY[status as ErasureRequestStatusCopyKey] ??
    ERASURE_REQUEST_STATUS_COPY.submitted;
  const handledCopy = handledStatus
    ? ERASURE_REQUEST_HANDLED_STATUS_OPTIONS.find(
        (option) => option.value === handledStatus,
      )
    : null;

  return { ...statusCopy, handled: handledCopy ?? null };
}

export function formatErasureRequestReference(id: string) {
  return `request-${id.replaceAll("-", "").slice(-8)}`;
}
