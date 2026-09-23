/**
 * Where an answer to a claim lands (`OVE-495`): the inbox, with the claim and
 * whether this answer was the one stored. The page reads the claim back and
 * says what it is now; the address never carries a name or a decision a
 * reader could edit into a false sentence.
 */
export type LineageClaimOutcomeResult = "done" | "stale";

const CLAIMS_PATH = "/garden/lineage/claims";

export function lineageClaimOutcomePath(
  edgeId: string,
  result: LineageClaimOutcomeResult,
) {
  return `${CLAIMS_PATH}?${new URLSearchParams({ claim: edgeId, result })}`;
}

export function readLineageClaimOutcome(
  params: Record<string, string | string[] | undefined>,
): { edgeId: string; result: LineageClaimOutcomeResult } | null {
  const edgeId = first(params.claim)?.trim();
  const result = first(params.result);
  if (!edgeId || edgeId.length > 80) return null;
  if (result !== "done" && result !== "stale") return null;
  return { edgeId, result };
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
