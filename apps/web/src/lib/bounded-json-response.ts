export type BoundedJsonResponseErrorCode = "too_large" | "invalid";

export class BoundedJsonResponseError extends Error {
  constructor(readonly code: BoundedJsonResponseErrorCode) {
    super(code);
    this.name = "BoundedJsonResponseError";
  }
}

/**
 * Reads JSON incrementally so an untrusted or unhealthy upstream cannot make a
 * nominal byte budget allocate an unbounded response body first.
 */
export async function readBoundedJsonResponse(
  response: Response,
  maxBytes: number,
): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new BoundedJsonResponseError("invalid");
  }
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new BoundedJsonResponseError("too_large");
  }
  if (!response.body) throw new BoundedJsonResponseError("invalid");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new BoundedJsonResponseError("too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch {
    throw new BoundedJsonResponseError("invalid");
  }
}
