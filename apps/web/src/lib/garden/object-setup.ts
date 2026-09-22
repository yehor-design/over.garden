import type { PlantObjectKind } from "@/db/schema";

/**
 * The standalone "add a plant or an animal" contract (`OVE-485`).
 *
 * An owned object needs exactly what `plant_objects` requires: a kind, a name
 * and a space. A catalogue identity is optional — the existing permissive
 * rule: a pick links the shared organism, an own label is kept as free text,
 * and nothing at all is `unknown`. There is no "no space" choice because the
 * schema has none (`space_id` is not null).
 *
 * As with a space, the client-made request id *is* the new object's id, so a
 * double press or a retry after a lost response reads back the first object.
 * Creating an object publishes nothing; the first entry is its own publication.
 */
export const OBJECT_NAME_MAX_LENGTH = 120;

export interface ObjectSetupInput {
  requestId: string;
  objectKind: PlantObjectKind;
  displayName: string;
  spaceId: string;
  catalogItemId: string | null;
  /** The gardener's own label when they kept the name without a match. */
  catalogLabel: string | null;
  allowDuplicateName: boolean;
}

export type ObjectSetupFieldError =
  | "name_required"
  | "name_too_long"
  | "space_required";

export interface CreatedObject {
  id: string;
  displayName: string;
  objectKind: PlantObjectKind;
  space: { id: string; displayName: string };
  catalog: { id: string; canonicalName: string } | null;
}

export type ObjectSetupResponse =
  | { status: "created"; object: CreatedObject; replayed: boolean }
  | {
      status: "invalid";
      errors: Partial<Record<"name" | "space", ObjectSetupFieldError>>;
    }
  | { status: "duplicate_name"; existing: CreatedObject }
  | { status: "space_unavailable" }
  | { status: "identity_unavailable" }
  | { status: "conflict" }
  | { status: "unavailable"; digest: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isObjectSetupUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function normalizeObjectName(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFC").replace(/\s+/gu, " ").trim()
    : "";
}

export function validateObjectSetup(input: {
  displayName: unknown;
  spaceId: unknown;
}): Partial<Record<"name" | "space", ObjectSetupFieldError>> {
  const errors: Partial<Record<"name" | "space", ObjectSetupFieldError>> = {};
  const name = normalizeObjectName(input.displayName);
  if (!name) errors.name = "name_required";
  else if ([...name].length > OBJECT_NAME_MAX_LENGTH)
    errors.name = "name_too_long";
  if (!isObjectSetupUuid(input.spaceId)) errors.space = "space_required";
  return errors;
}

export class InvalidObjectSetupRequest extends Error {}

export function parseObjectSetupRequest(raw: unknown):
  | { ok: true; input: ObjectSetupInput }
  | {
      ok: false;
      errors: Partial<Record<"name" | "space", ObjectSetupFieldError>>;
    } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new InvalidObjectSetupRequest();
  }
  const value = raw as Record<string, unknown>;
  if (!isObjectSetupUuid(value.requestId))
    throw new InvalidObjectSetupRequest();
  if (value.objectKind !== "plant" && value.objectKind !== "animal") {
    throw new InvalidObjectSetupRequest();
  }
  if (
    typeof value.displayName !== "string" ||
    value.displayName.length > 1000
  ) {
    throw new InvalidObjectSetupRequest();
  }
  if (
    value.catalogItemId !== null &&
    value.catalogItemId !== undefined &&
    !isObjectSetupUuid(value.catalogItemId)
  ) {
    throw new InvalidObjectSetupRequest();
  }
  if (
    value.catalogLabel !== null &&
    value.catalogLabel !== undefined &&
    (typeof value.catalogLabel !== "string" || value.catalogLabel.length > 1000)
  ) {
    throw new InvalidObjectSetupRequest();
  }
  const errors = validateObjectSetup({
    displayName: value.displayName,
    spaceId: value.spaceId,
  });
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const catalogItemId =
    typeof value.catalogItemId === "string"
      ? value.catalogItemId.toLowerCase()
      : null;
  const label = catalogItemId ? "" : normalizeObjectName(value.catalogLabel);
  return {
    ok: true,
    input: {
      requestId: (value.requestId as string).toLowerCase(),
      objectKind: value.objectKind,
      displayName: normalizeObjectName(value.displayName),
      spaceId: (value.spaceId as string).toLowerCase(),
      catalogItemId,
      catalogLabel: label
        ? [...label].slice(0, OBJECT_NAME_MAX_LENGTH).join("")
        : null,
      allowDuplicateName: value.allowDuplicateName === true,
    },
  };
}

/**
 * A workspace path only, so a crafted link cannot carry the new id elsewhere.
 * Anything else is no return at all — the flow then shows its own result.
 */
export function normalizeObjectSetupReturnTo(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !value.startsWith("/garden") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f]/u.test(value) ||
    value.length > 500
  ) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value, "https://over.garden");
  } catch {
    return null;
  }
  if (url.origin !== "https://over.garden") return null;
  if (url.pathname !== "/garden" && !url.pathname.startsWith("/garden/")) {
    return null;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Where the object's own page offers writing its first entry. */
export function gardenObjectWritePath(objectId: string) {
  return `/garden/objects/${encodeURIComponent(objectId)}#follow-up-composer`;
}
