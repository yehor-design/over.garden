import type { PlantObjectKind } from "@/db/schema";
import {
  parseOwnedPhotoPayload,
  type OwnedPhotoPayload,
} from "@/lib/garden/owned-photo";

/**
 * The "add a plant or an animal" contract (`OVE-485`, the stepper of
 * `OVE-524`).
 *
 * An owned object needs what `plant_objects` requires — a kind, a name and a
 * space — and may carry a photo and two choices the gardener makes, stored as
 * they were made (migration 0086):
 *
 *   * the species: not known, a species of the standard base, or the
 *     gardener's own text;
 *   * the cultivar or breed: not known; after a base species, an entry of
 *     that species' list or a new name that becomes one; after an own
 *     species, the gardener's own text.
 *
 * Nothing is guessed: no species comes from the object's name, and a
 * cultivar is never asked without a species.
 *
 * As with a space, the client-made request id *is* the new object's id, so a
 * double press or a retry after a lost response reads back the first object.
 * Creating an object publishes nothing; the first entry is its own publication.
 */
export const OBJECT_NAME_MAX_LENGTH = 120;
/** An own species or cultivar text, and a new entry's name: 1–120 characters. */
export const OBJECT_CHOICE_TEXT_MAX_LENGTH = 120;

export type ObjectSpeciesChoice =
  | { kind: "unknown" }
  | { kind: "catalog"; catalogItemId: string }
  | { kind: "own"; text: string };

export type ObjectCultivarChoice =
  | { kind: "unknown" }
  | { kind: "entry"; catalogItemId: string }
  | { kind: "new"; name: string }
  | { kind: "own"; text: string };

export interface ObjectSetupInput {
  requestId: string;
  objectKind: PlantObjectKind;
  displayName: string;
  spaceId: string;
  species: ObjectSpeciesChoice;
  cultivar: ObjectCultivarChoice;
  /** The photo the stepper staged (ADR-0036 D1), or null. */
  photo: OwnedPhotoPayload | null;
  allowDuplicateName: boolean;
}

export type ObjectSetupFieldError =
  | "name_required"
  | "name_too_long"
  | "space_required"
  | "text_required"
  | "text_too_long";

export type ObjectSetupField = "name" | "space" | "species" | "cultivar";

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
      errors: Partial<Record<ObjectSetupField, ObjectSetupFieldError>>;
    }
  | { status: "duplicate_name"; existing: CreatedObject }
  | { status: "space_unavailable" }
  /** The chosen species or cultivar is not selectable (any more). */
  | { status: "identity_unavailable" }
  /** The staged photo could not be claimed: it expired or was already used. */
  | { status: "photo_unavailable" }
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

/** An own text or a new entry's name, or the error that says why it is not. */
export function validateObjectChoiceText(
  value: unknown,
): { ok: true; text: string } | { ok: false; error: ObjectSetupFieldError } {
  const text = normalizeObjectName(value);
  if (!text) return { ok: false, error: "text_required" };
  if ([...text].length > OBJECT_CHOICE_TEXT_MAX_LENGTH) {
    return { ok: false, error: "text_too_long" };
  }
  return { ok: true, text };
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

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isBoundedString(value: unknown): value is string {
  return typeof value === "string" && value.length <= 1000;
}

/**
 * The two choices as the request states them. A shape the stepper cannot
 * send — a cultivar without a species, a list entry after an own species —
 * is a malformed request, not a field error.
 */
function parseChoices(
  species: unknown,
  cultivar: unknown,
  errors: Partial<Record<ObjectSetupField, ObjectSetupFieldError>>,
): { species: ObjectSpeciesChoice; cultivar: ObjectCultivarChoice } {
  const speciesValue =
    species === undefined ? { kind: "unknown" } : readRecord(species);
  const cultivarValue =
    cultivar === undefined ? { kind: "unknown" } : readRecord(cultivar);
  if (!speciesValue || !cultivarValue) throw new InvalidObjectSetupRequest();

  let parsedSpecies: ObjectSpeciesChoice = { kind: "unknown" };
  if (speciesValue.kind === "catalog") {
    if (!isObjectSetupUuid(speciesValue.catalogItemId)) {
      throw new InvalidObjectSetupRequest();
    }
    parsedSpecies = {
      kind: "catalog",
      catalogItemId: speciesValue.catalogItemId.toLowerCase(),
    };
  } else if (speciesValue.kind === "own") {
    if (!isBoundedString(speciesValue.text))
      throw new InvalidObjectSetupRequest();
    const text = validateObjectChoiceText(speciesValue.text);
    if (text.ok) parsedSpecies = { kind: "own", text: text.text };
    else errors.species = text.error;
  } else if (speciesValue.kind !== "unknown") {
    throw new InvalidObjectSetupRequest();
  }

  let parsedCultivar: ObjectCultivarChoice = { kind: "unknown" };
  if (cultivarValue.kind === "entry") {
    if (speciesValue.kind !== "catalog") throw new InvalidObjectSetupRequest();
    if (!isObjectSetupUuid(cultivarValue.catalogItemId)) {
      throw new InvalidObjectSetupRequest();
    }
    parsedCultivar = {
      kind: "entry",
      catalogItemId: cultivarValue.catalogItemId.toLowerCase(),
    };
  } else if (cultivarValue.kind === "new" || cultivarValue.kind === "own") {
    const expected = cultivarValue.kind === "new" ? "catalog" : "own";
    if (speciesValue.kind !== expected) throw new InvalidObjectSetupRequest();
    const raw =
      cultivarValue.kind === "new" ? cultivarValue.name : cultivarValue.text;
    if (!isBoundedString(raw)) throw new InvalidObjectSetupRequest();
    const text = validateObjectChoiceText(raw);
    if (!text.ok) errors.cultivar = text.error;
    else
      parsedCultivar =
        cultivarValue.kind === "new"
          ? { kind: "new", name: text.text }
          : { kind: "own", text: text.text };
  } else if (cultivarValue.kind !== "unknown") {
    throw new InvalidObjectSetupRequest();
  }
  return { species: parsedSpecies, cultivar: parsedCultivar };
}

export function parseObjectSetupRequest(raw: unknown):
  | { ok: true; input: ObjectSetupInput }
  | {
      ok: false;
      errors: Partial<Record<ObjectSetupField, ObjectSetupFieldError>>;
    } {
  const value = readRecord(raw);
  if (!value) throw new InvalidObjectSetupRequest();
  if (!isObjectSetupUuid(value.requestId))
    throw new InvalidObjectSetupRequest();
  if (value.objectKind !== "plant" && value.objectKind !== "animal") {
    throw new InvalidObjectSetupRequest();
  }
  if (!isBoundedString(value.displayName)) {
    throw new InvalidObjectSetupRequest();
  }
  let photo: OwnedPhotoPayload | null;
  try {
    photo = parseOwnedPhotoPayload(value.photo);
  } catch {
    throw new InvalidObjectSetupRequest();
  }
  const errors: Partial<Record<ObjectSetupField, ObjectSetupFieldError>> =
    validateObjectSetup({
      displayName: value.displayName,
      spaceId: value.spaceId,
    });
  const choices = parseChoices(value.species, value.cultivar, errors);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    input: {
      requestId: (value.requestId as string).toLowerCase(),
      objectKind: value.objectKind,
      displayName: normalizeObjectName(value.displayName),
      spaceId: (value.spaceId as string).toLowerCase(),
      species: choices.species,
      cultivar: choices.cultivar,
      photo,
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
