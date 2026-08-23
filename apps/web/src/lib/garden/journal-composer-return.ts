import type { JournalEntryTarget } from "./entry-contracts";

const SAFE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function journalCreateReturnFallback(input: {
  target: JournalEntryTarget;
  plantObjectId?: string | null;
}): string {
  if (
    input.target === "plant_object_entry" &&
    input.plantObjectId &&
    SAFE_UUID.test(input.plantObjectId)
  ) {
    return `/garden/objects/${input.plantObjectId}`;
  }
  return "/garden";
}

export function normalizeJournalComposerReturnTo(
  value: unknown,
  fallback: string,
  origin = "https://over.garden",
): string {
  const safeFallback = normalizeInternalPath(fallback, origin) ?? "/garden";
  return normalizeInternalPath(value, origin) ?? safeFallback;
}

function normalizeInternalPath(value: unknown, origin: string): string | null {
  if (typeof value !== "string" || !value || /[\\\u0000-\u001f]/.test(value)) {
    return null;
  }
  let base: URL;
  let candidate: URL;
  try {
    base = new URL(origin);
    candidate = new URL(value, base);
  } catch {
    return null;
  }
  if (candidate.origin !== base.origin) return null;
  if (!value.startsWith("/") && !value.startsWith(`${base.origin}/`)) {
    return null;
  }
  if (value.startsWith("//")) return null;
  if (
    candidate.pathname === "/api" ||
    candidate.pathname.startsWith("/api/") ||
    candidate.pathname === "/_next" ||
    candidate.pathname.startsWith("/_next/")
  ) {
    return null;
  }
  return `${candidate.pathname}${candidate.search}${candidate.hash}`;
}
