const INTERNAL_RETURN_PATH_ORIGIN = "https://over.garden";
const MAX_INTERNAL_RETURN_PATH_LENGTH = 2_048;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F-\u009F]/u;
const ENCODED_PATH_SEPARATOR_PATTERN = /%(?:2f|5c)/i;

export class InternalReturnPathError extends Error {
  constructor() {
    super("Return path must stay on the OverGarden origin.");
    this.name = "InternalReturnPathError";
  }
}

/**
 * Parses an untrusted form return path into the canonical app-relative form.
 *
 * This is deliberately route-agnostic: callers that need a narrower product
 * surface (for example auth intent or notification receipts) apply their
 * route/query policy after this same-origin boundary has passed.
 */
export function parseInternalReturnPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_INTERNAL_RETURN_PATH_LENGTH ||
    value !== value.trim() ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    throw new InternalReturnPathError();
  }

  assertDecodedPathIsInternal(value);

  let url: URL;
  try {
    url = new URL(value, INTERNAL_RETURN_PATH_ORIGIN);
  } catch {
    throw new InternalReturnPathError();
  }

  if (
    url.origin !== INTERNAL_RETURN_PATH_ORIGIN ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !url.pathname.startsWith("/") ||
    url.pathname.startsWith("//") ||
    url.pathname.includes("\\") ||
    CONTROL_CHARACTER_PATTERN.test(url.pathname)
  ) {
    throw new InternalReturnPathError();
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export function normalizeInternalReturnPath(
  value: unknown,
  fallback: string,
): string {
  try {
    return parseInternalReturnPath(value);
  } catch {
    return parseInternalReturnPath(fallback);
  }
}

function assertDecodedPathIsInternal(value: string) {
  let decoded = value;

  // Decode repeatedly so `%252f` cannot become a slash only after an
  // intermediary has accepted it. The length cap bounds this loop.
  while (true) {
    if (
      decoded.includes("\\") ||
      CONTROL_CHARACTER_PATTERN.test(decoded) ||
      decoded.startsWith("//") ||
      ENCODED_PATH_SEPARATOR_PATTERN.test(decoded)
    ) {
      throw new InternalReturnPathError();
    }

    if (!decoded.includes("%")) return;

    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      throw new InternalReturnPathError();
    }

    if (next === decoded) return;
    decoded = next;
  }
}
