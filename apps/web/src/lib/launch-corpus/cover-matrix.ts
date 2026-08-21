/**
 * OVE-199 cover/reorder/lifecycle matrix covered by local fixtures + unit proof.
 * Does not mutate the current VISUAL_FIXTURE_MANIFEST (ove187-v9 hash stays frozen).
 */

export const LAUNCH_CORPUS_LOCAL_COVER_MATRIX = [
  {
    id: "local-no-media",
    branch: "no_image_no_cover",
    coveredBy: "unit+existing-fixture-none",
  },
  {
    id: "local-one-inline-auto",
    branch: "one_inline_automatic_cover",
    coveredBy: "unit+journal-cover-contract",
  },
  {
    id: "local-multi-explicit",
    branch: "multi_interleaved_explicit_non_first",
    coveredBy: "unit+journal-cover-contract",
  },
  {
    id: "local-cover-only",
    branch: "dedicated_cover_only",
    coveredBy: "unit+journal-cover-contract",
  },
  {
    id: "local-reorder-auto",
    branch: "reordered_automatic_fallback",
    coveredBy: "unit+journal-cover-contract",
  },
  {
    id: "local-reorder-explicit-stable",
    branch: "explicit_cover_stable_after_reorder",
    coveredBy: "unit+journal-cover-contract",
  },
  {
    id: "local-keep-as-cover",
    branch: "inline_to_cover_only",
    coveredBy: "unit+OVE-207-scenarios",
  },
  {
    id: "local-replace-success",
    branch: "cover_replaced_successfully",
    coveredBy: "unit+OVE-207-scenarios",
  },
  {
    id: "local-replace-failure",
    branch: "cover_replace_failure_preserves_prior",
    coveredBy: "unit+OVE-207-scenarios",
  },
  {
    id: "local-remove-fallback",
    branch: "cover_removed_with_fallback",
    coveredBy: "unit+journal-cover-contract",
  },
  {
    id: "local-remove-no-media",
    branch: "cover_removed_no_remaining_image",
    coveredBy: "unit+journal-cover-contract",
  },
  {
    id: "local-aspects",
    branch: "portrait_landscape_square_subject_near_edge",
    coveredBy: "visual-fixture-media-files",
  },
  {
    id: "local-ten-plus-one",
    branch: "ten_inline_plus_one_cover",
    coveredBy: "unit+OVE-207-scenarios",
  },
  {
    id: "local-eleventh-reject",
    branch: "eleventh_inline_rejection",
    coveredBy: "unit+journal-document",
  },
  {
    id: "local-lifecycle",
    branch: "private_public_archived_410_search_card_seo",
    coveredBy: "visual-fixture-state-coverage",
  },
  {
    id: "local-production-refuse",
    branch: "visual_fixture_production_refusal",
    coveredBy: "visual-fixtures-environment",
  },
] as const;

export function listLocalCoverMatrixBranchIds(): string[] {
  return LAUNCH_CORPUS_LOCAL_COVER_MATRIX.map((row) => row.id);
}

export function assertLocalCoverMatrixComplete(): void {
  if (LAUNCH_CORPUS_LOCAL_COVER_MATRIX.length < 16) {
    throw new Error("OVE-199 local cover matrix is incomplete.");
  }
}
