import "server-only";

export class BoundedJsonPayloadTooLargeError extends Error {
  constructor() {
    super("JSON payload exceeds its byte budget.");
    this.name = "BoundedJsonPayloadTooLargeError";
  }
}

export class BoundedJsonInvalidError extends Error {
  constructor() {
    super("JSON payload is invalid.");
    this.name = "BoundedJsonInvalidError";
  }
}

export async function readBoundedJsonRequest(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new BoundedJsonPayloadTooLargeError();
  }
  if (!request.body) throw new BoundedJsonInvalidError();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new BoundedJsonPayloadTooLargeError();
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new BoundedJsonInvalidError();
  }
}
