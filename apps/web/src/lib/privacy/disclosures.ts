export const FIRST_PUBLICATION_DISCLOSURE_VERSION = "first-publication-v2";
export const ERASURE_REQUEST_INTAKE_VERSION = "erasure-request-pilot-v2";

export const PILOT_LEGAL_COPY_STATUS =
  "closed_pilot_reviewed_public_release_blocked" as const;

export const PILOT_LEGAL_COPY_STATUS_LABEL =
  "Reviewed for the closed pilot; public release remains blocked";

export const FIRST_PUBLICATION_DISCLOSURE_LINES = [
  "Publishing makes this journal entry publicly readable by people with access to the public page.",
  "Public pages remain noindex during the closed pilot unless explicit promotion rules allow indexing; noindex is not a secrecy guarantee.",
  "Precise location is not collected or shown in v0; only supported coarse regions can appear when you choose region visibility.",
  "Original photos stay in private quarantine and are deleted after successful processing; public pages can show only stripped derivatives.",
  "You can archive a public entry so its old public URL returns 410 Gone, leaves sitemap/search surfaces, and stays noindex.",
] as const;

export const ERASURE_REQUEST_ACKNOWLEDGEMENT_LINES = [
  "Submitting this request records an operator-reviewed intake row for account data erasure or anonymization.",
  "No account, journal entry, media object, search document, or analytics row is deleted automatically by this form.",
  "A closed-pilot operator can move the request through submitted, reviewing, and handled statuses without reading private journal text.",
  "Irreversible erasure or anonymization still requires maintainer approval and a manual operator workflow.",
] as const;

export const PILOT_PUBLIC_RELEASE_BLOCKERS = [
  "Final reviewed legal policy text.",
  "Verified operator contact and response process.",
  "Processor, retention, and legal-basis wording.",
  "Maintainer-approved irreversible erasure/anonymization procedure.",
] as const;

export type ErasureRequestStatusCopyKey =
  | "submitted"
  | "reviewing"
  | "handled"
  | "canceled";

export type ErasureRequestHandledStatusCopyKey =
  | "completed"
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
      "The request has been received and is waiting for closed-pilot operator review.",
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
    value: "declined",
    label: "Declined",
    description:
      "Operator declined the request and must communicate the reason outside this minimal pilot surface.",
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
      "Operator cannot proceed until the requester is verified through the closed-pilot support process.",
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
