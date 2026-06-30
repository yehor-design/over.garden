import { readFileSync } from "node:fs";

const MANIFEST_URL = new URL(
  "../../../../../docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json",
  import.meta.url,
);

const CANONICAL_PRODUCT_USAGE = "canonical_product_projection";

export type CatalogSourceReadinessVerdict =
  | "USE"
  | "USE-WITH-CONDITIONS"
  | "INTERNAL-VALIDATION-ONLY"
  | "REJECT";

export type CatalogSourceProductSurface =
  | "catalog_items"
  | "catalog_item_names"
  | "catalog_alias_projections"
  | "catalog_source_links";

export type CatalogSourceProjectionGateScope =
  | "curator_promotion"
  | "manual_seed"
  | "reviewed_subset";

export interface CatalogSourceReadiness {
  slug: string;
  name?: string;
  verdict: CatalogSourceReadinessVerdict;
  allowedUsage: string[];
  conditions?: string[];
  blockers?: string[];
  nextAction?: string;
}

export interface CatalogSourceReadinessManifest {
  sources: CatalogSourceReadiness[];
}

export interface CatalogSourceSpecificProjectionGate {
  issueKey: string;
  gateId: string;
  scope: CatalogSourceProjectionGateScope;
}

export interface CatalogSourceProductProjectionRequest {
  sourceSlug: string;
  sourceVersion?: string;
  sourceRecordKey?: string;
  productSurface: CatalogSourceProductSurface;
  productSource?: string;
  productSourceId?: string;
  explicitGate?: CatalogSourceSpecificProjectionGate;
  manifest?: CatalogSourceReadinessManifest;
}

export interface CatalogSourcesProductProjectionRequest extends Omit<
  CatalogSourceProductProjectionRequest,
  "sourceSlug"
> {
  sourceSlugs: readonly string[];
}

export type CatalogSourceProjectionDecision =
  | {
      allowed: true;
      sourceSlug: string;
      productSurface: CatalogSourceProductSurface;
      verdict: CatalogSourceReadinessVerdict | "SOURCE-SPECIFIC-GATE";
      allowedUsage: string[];
      gateIssueKey?: string;
      message: string;
    }
  | {
      allowed: false;
      sourceSlug: string;
      productSurface: CatalogSourceProductSurface;
      verdict: CatalogSourceReadinessVerdict | "UNKNOWN";
      allowedUsage: string[];
      nextAction: string;
      message: string;
    };

interface SourceSpecificGatePolicy {
  issueKey: string;
  gateId: string;
  scope: CatalogSourceProjectionGateScope;
  sourceVersions?: readonly string[];
  sourceRecordKeys?: readonly string[];
  productSources?: readonly string[];
  productSourceIds?: readonly string[];
  nextAction: string;
}

const SOURCE_SPECIFIC_PRODUCT_GATES: Record<
  string,
  readonly SourceSpecificGatePolicy[]
> = {
  "eu-common-catalogue": [
    {
      issueKey: "OVE-61",
      gateId: "ove-61-bg-official-variety-reviewed-subset",
      scope: "reviewed_subset",
      sourceVersions: ["2026-06-30-bg-proof-subset"],
      sourceRecordKeys: ["EU-PVP:BG:SADOVO-1"],
      productSources: ["eu_common_catalogue_bg"],
      productSourceIds: ["EU-PVP:BG:SADOVO-1"],
      nextAction:
        "Keep broader EU/Common Catalogue and IASAS rows raw/quarantined until a fresh source-specific gate closes the export, parser, and reuse blockers.",
    },
  ],
  "ua-official-bee-breeds": [
    {
      issueKey: "OVE-60",
      gateId: "ove-60-ua-official-bee-breed-manual-seed",
      scope: "manual_seed",
      sourceVersions: ["law-1492-iii-manual-seed-2026-06-30"],
      sourceRecordKeys: ["ua-law-1492-iii:bee-breed:carpathian"],
      productSources: ["ua_official_bee_breed"],
      productSourceIds: ["ua-official-bee-breeds:carpathian"],
      nextAction:
        "Keep VBO, DAD-IS, EFABIS, and any unreviewed breed mappings internal-only until their own source-specific gate is cleared.",
    },
  ],
};

let cachedManifest: CatalogSourceReadinessManifest | null = null;

export class CatalogSourceProjectionBlockedError extends Error {
  constructor(
    readonly decision: Extract<
      CatalogSourceProjectionDecision,
      { allowed: false }
    >,
  ) {
    super(decision.message);
    this.name = "CatalogSourceProjectionBlockedError";
  }
}

export function readCatalogSourceReadinessManifest(): CatalogSourceReadinessManifest {
  cachedManifest ??= JSON.parse(
    readFileSync(MANIFEST_URL, "utf8"),
  ) as CatalogSourceReadinessManifest;
  return cachedManifest;
}

export function checkCatalogSourceProductProjection(
  request: CatalogSourceProductProjectionRequest,
): CatalogSourceProjectionDecision {
  const manifest = request.manifest ?? readCatalogSourceReadinessManifest();
  const source = manifest.sources.find(
    (item) => item.slug === request.sourceSlug,
  );

  if (
    source?.verdict === "USE" &&
    source.allowedUsage.includes(CANONICAL_PRODUCT_USAGE)
  ) {
    return {
      allowed: true,
      sourceSlug: request.sourceSlug,
      productSurface: request.productSurface,
      verdict: source.verdict,
      allowedUsage: source.allowedUsage,
      message: `${request.sourceSlug} may project to ${request.productSurface}: OVE-55 verdict USE includes ${CANONICAL_PRODUCT_USAGE}.`,
    };
  }

  const gateDecision = checkSourceSpecificGate(request);
  if (gateDecision.allowed) {
    return gateDecision;
  }

  const verdict = source?.verdict ?? "UNKNOWN";
  const allowedUsage = source?.allowedUsage ?? [];
  const nextAction =
    gateDecision.nextAction ??
    nextActionForBlockedSource(source, request.sourceSlug);

  return {
    allowed: false,
    sourceSlug: request.sourceSlug,
    productSurface: request.productSurface,
    verdict,
    allowedUsage,
    nextAction,
    message: `${request.sourceSlug} cannot project to ${request.productSurface}: verdict ${verdict}, allowedUsage ${formatAllowedUsage(
      allowedUsage,
    )}. Next action: ${nextAction}`,
  };
}

export function assertCatalogSourceProductProjectionAllowed(
  request: CatalogSourceProductProjectionRequest,
): Extract<CatalogSourceProjectionDecision, { allowed: true }> {
  const decision = checkCatalogSourceProductProjection(request);
  if (!decision.allowed) {
    throw new CatalogSourceProjectionBlockedError(decision);
  }
  return decision;
}

export function assertCatalogSourcesProductProjectionAllowed(
  request: CatalogSourcesProductProjectionRequest,
): Array<Extract<CatalogSourceProjectionDecision, { allowed: true }>> {
  return request.sourceSlugs.map((sourceSlug) =>
    assertCatalogSourceProductProjectionAllowed({
      ...request,
      sourceSlug,
    }),
  );
}

function checkSourceSpecificGate(
  request: CatalogSourceProductProjectionRequest,
):
  | Extract<CatalogSourceProjectionDecision, { allowed: true }>
  | { allowed: false; nextAction?: string } {
  const policies = SOURCE_SPECIFIC_PRODUCT_GATES[request.sourceSlug] ?? [];
  if (policies.length === 0) {
    return { allowed: false };
  }

  const fallbackNextAction = policies[0]?.nextAction;
  if (!request.explicitGate) {
    return { allowed: false, nextAction: fallbackNextAction };
  }

  for (const policy of policies) {
    if (
      request.explicitGate.issueKey !== policy.issueKey ||
      request.explicitGate.gateId !== policy.gateId ||
      request.explicitGate.scope !== policy.scope
    ) {
      continue;
    }

    if (
      !matchesOptionalAllowlist(request.sourceVersion, policy.sourceVersions)
    ) {
      return { allowed: false, nextAction: policy.nextAction };
    }
    if (
      !matchesOptionalAllowlist(
        request.sourceRecordKey,
        policy.sourceRecordKeys,
      )
    ) {
      return { allowed: false, nextAction: policy.nextAction };
    }
    if (
      !matchesOptionalAllowlist(request.productSource, policy.productSources)
    ) {
      return { allowed: false, nextAction: policy.nextAction };
    }
    if (
      !matchesOptionalAllowlist(
        request.productSourceId,
        policy.productSourceIds,
      )
    ) {
      return { allowed: false, nextAction: policy.nextAction };
    }

    return {
      allowed: true,
      sourceSlug: request.sourceSlug,
      productSurface: request.productSurface,
      verdict: "SOURCE-SPECIFIC-GATE",
      allowedUsage: [CANONICAL_PRODUCT_USAGE, policy.scope],
      gateIssueKey: policy.issueKey,
      message: `${request.sourceSlug} may project to ${request.productSurface}: ${policy.issueKey} ${policy.scope} gate allows only this bounded source/version/record path.`,
    };
  }

  return { allowed: false, nextAction: fallbackNextAction };
}

function matchesOptionalAllowlist(
  value: string | undefined,
  allowlist: readonly string[] | undefined,
) {
  if (!allowlist) return true;
  return value !== undefined && allowlist.includes(value);
}

function nextActionForBlockedSource(
  source: CatalogSourceReadiness | undefined,
  sourceSlug: string,
) {
  if (!source) {
    return `Add ${sourceSlug} to the OVE-55 source readiness manifest and pass a fresh source-specific projection gate before any product projection.`;
  }

  if (typeof source.nextAction === "string" && source.nextAction.length > 0) {
    return source.nextAction;
  }

  const blockers = [...(source.conditions ?? []), ...(source.blockers ?? [])];
  if (blockers.length > 0) {
    return `Resolve source blockers before product projection: ${blockers.join("; ")}`;
  }

  if (
    source.verdict === "USE" &&
    !source.allowedUsage.includes(CANONICAL_PRODUCT_USAGE)
  ) {
    return `Run a fresh source gate before adding ${CANONICAL_PRODUCT_USAGE} to ${source.slug}.`;
  }

  return "Keep this source raw/internal-only until a fresh source-specific gate explicitly clears canonical product projection.";
}

function formatAllowedUsage(allowedUsage: readonly string[]) {
  return allowedUsage.length > 0 ? allowedUsage.join(", ") : "none";
}
