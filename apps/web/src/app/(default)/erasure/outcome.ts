/**
 * Where the erasure form lands (`OVE-505`): the page, told whether the
 * request was received or refused before it was sent. The page reads the
 * request itself back to say what it is; the address carries no reference.
 */
export type ErasureOutcome = "received" | "acknowledgement-required";

export function erasureOutcomePath(outcome: ErasureOutcome) {
  return `/erasure?${new URLSearchParams({ result: outcome })}`;
}

export function readErasureOutcome(
  value: string | string[] | undefined,
): ErasureOutcome | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "received" || candidate === "acknowledgement-required"
    ? candidate
    : null;
}
