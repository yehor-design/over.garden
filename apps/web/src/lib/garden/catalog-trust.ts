import type { CatalogKind } from "@/db/schema";

export type CatalogTrustState =
  | "curated"
  | "source_backed"
  | "candidate"
  | "user_added"
  | "quarantined"
  | "rejected";

export interface CatalogTrustMetadata {
  trustState: CatalogTrustState;
  trustLabel: string;
  sourceLabel: string;
  sourceCaveat: string;
  disambiguationLabel: string;
}

export interface CatalogTrustInput {
  status?: string | null;
  source?: string | null;
  catalogKind?: CatalogKind | string | null;
  locale?: string | null;
}

export function catalogSuggestionTrustMetadata(
  input: CatalogTrustInput,
): CatalogTrustMetadata {
  const trustState = catalogTrustState(input);
  const trustLabel = catalogTrustStateLabel(trustState, input.status);
  const sourceLabel = catalogSourceLabel(input.source);
  const sourceCaveat = catalogSourceCaveat(input, trustState);
  const disambiguationLabel = [
    catalogKindTrustLabel(input.catalogKind),
    sourceLabel,
    input.locale ? input.locale : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    trustState,
    trustLabel,
    sourceLabel,
    sourceCaveat,
    disambiguationLabel,
  };
}

export function catalogTrustState(input: CatalogTrustInput): CatalogTrustState {
  if (input.status === "confirmed") return "curated";
  if (input.status === "provisional" || input.source === "user_added") {
    return "user_added";
  }
  if (input.status === "quarantined") return "quarantined";
  if (input.status === "blocked" || input.status === "rejected") {
    return "rejected";
  }
  if (input.status === "promoted") return "source_backed";
  if (
    input.status === "held" ||
    input.status === "review_needed" ||
    input.source === "grin_genebank_candidate" ||
    input.source === "internal_seed"
  ) {
    return "candidate";
  }
  return "source_backed";
}

export function catalogTrustStateLabel(
  state: CatalogTrustState,
  status?: string | null,
) {
  if (status === "blocked") return "Blocked";
  switch (state) {
    case "curated":
      return "Curated";
    case "source_backed":
      return "Source-backed";
    case "candidate":
      return "Candidate";
    case "user_added":
      return "Your name";
    case "quarantined":
      return "Quarantined";
    case "rejected":
      return "Rejected";
  }
}

export function catalogSourceLabel(source: string | null | undefined) {
  switch (source) {
    case "stable_registry":
      return "OverGarden Stable Registry";
    case "internal_seed":
      return "OverGarden starter catalog";
    case "ua_state_register":
      return "Ukraine variety register";
    case "species_backbone":
      return "Species backbone";
    case "ua_official_bee_breed":
      return "Ukraine bee breed list";
    case "vertebrate_breed_ontology":
      return "Breed ontology";
    case "eu_common_catalogue_bg":
      return "EU/BG catalogue seed";
    case "eu_oj_eur_lex_common_catalogue":
      return "EU Official Journal";
    case "grin_genebank_candidate":
    case "grin-global":
      return "GRIN/NPGS candidate";
    case "user_added":
      return "User-added name";
    default:
      return "Catalog source";
  }
}

export function catalogSourceCaveat(
  input: CatalogTrustInput,
  state = catalogTrustState(input),
) {
  if (state === "curated") {
    if (input.source === "stable_registry") {
      return "Active immutable OverGarden identity. Compare the type and name before choosing.";
    }
    return "Curated OverGarden identity. Compare the type and name before choosing.";
  }
  if (state === "user_added") {
    return "Saved only for your garden until it is reviewed or merged.";
  }
  if (state === "quarantined") {
    return "Hidden from typeahead and public catalog until review clears it.";
  }
  if (state === "rejected") {
    return input.status === "blocked"
      ? "Blocked from product catalog until the source or legal issue is resolved."
      : "Rejected from product catalog projection.";
  }
  if (input.status === "held" || input.status === "review_needed") {
    return "Not selectable until review confirms the identity and source caveat.";
  }
  if (input.status === "promoted") {
    return "Promoted into the safe catalog projection for typeahead and public evidence.";
  }

  switch (input.source) {
    case "grin_genebank_candidate":
    case "grin-global":
      return "Reviewed enough for matching; not a claim that seed is available.";
    case "eu_oj_eur_lex_common_catalogue":
      return "Official Journal-backed row; portal-only rows stay hidden until cleared.";
    case "eu_common_catalogue_bg":
      return "EU/BG catalogue seed. Choose only when crop, type, and name match.";
    case "ua_state_register":
      return "Register-backed variety row. Compare crop and name if aliases collide.";
    case "species_backbone":
      return "Species-level identity, not a variety.";
    case "ua_official_bee_breed":
      return "Breed-level identity, not a colony.";
    case "vertebrate_breed_ontology":
      return "Breed ontology identity. Compare the object type before choosing.";
    case "internal_seed":
      return "Pilot seed row. Use your own name or Unknown if this is not exact.";
    default:
      return "Safe catalog identity fields only; raw source details stay out.";
  }
}

function catalogKindTrustLabel(value: CatalogTrustInput["catalogKind"]) {
  switch (value) {
    case "breed":
      return "Breed";
    case "species":
      return "Species";
    case "plant_variety":
      return "Plant variety";
    default:
      return "Catalog identity";
  }
}
