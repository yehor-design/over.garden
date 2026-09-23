/**
 * Where an owner's action on an erasure request lands (`OVE-505`): the list,
 * with the request and whether the action was stored. The page reads the
 * request back and says what state it is in now; the address carries no
 * state of its own that a reader could edit into a false sentence.
 */
export type OperatorErasureOutcome = "done" | "stale" | "approval";

const ERASURE_REQUESTS_PATH = "/garden/privacy/erasure-requests";

export function operatorErasureOutcomePath(
  requestId: string,
  result: OperatorErasureOutcome,
) {
  return `${ERASURE_REQUESTS_PATH}?${new URLSearchParams({
    request: requestId,
    result,
  })}`;
}

export function readOperatorErasureOutcome(
  params: Record<string, string | string[] | undefined>,
): { requestId: string; result: OperatorErasureOutcome } | null {
  const requestId = first(params.request)?.trim();
  const result = first(params.result);
  if (!requestId || requestId.length > 80) return null;
  if (result !== "done" && result !== "stale" && result !== "approval") {
    return null;
  }
  return { requestId, result };
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
