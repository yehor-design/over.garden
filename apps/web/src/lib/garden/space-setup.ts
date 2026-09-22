import {
  isCoarseRegionCode,
  normalizeCoarseRegionCode,
} from "@/lib/garden/regions";
import { normalizeJournalComposerReturnTo } from "@/lib/garden/journal-composer-return";

/**
 * The standalone "create a space" contract (`OVE-484`).
 *
 * A space has exactly the fields the `spaces` table holds: a name, whether its
 * coarse region may appear on public pages, and that region. Nothing else is
 * asked, so the flow never invents a step the product does not store.
 *
 * The request carries a client-made id. It *is* the new space's id, so a
 * second submit of the same intent — a double press, or a retry after a
 * response that never arrived — reads back the one space the first created
 * instead of writing another (INFORMATION_ARCHITECTURE.md, transaction table).
 */
export const SPACE_NAME_MAX_LENGTH = 120;

export type SpaceLocationVisibility = "hidden" | "region";

export interface SpaceSetupInput {
  requestId: string;
  displayName: string;
  locationVisibility: SpaceLocationVisibility;
  coarseRegionCode: string | null;
  /** The gardener saw the same-name warning and chose a second space anyway. */
  allowDuplicateName: boolean;
}

export type SpaceSetupFieldError =
  | "name_required"
  | "name_too_long"
  | "region_required"
  | "region_invalid";

export interface CreatedSpace {
  id: string;
  displayName: string;
  locationVisibility: SpaceLocationVisibility;
  coarseRegionCode: string | null;
}

export type SpaceSetupResponse =
  | { status: "created"; space: CreatedSpace; replayed: boolean }
  | {
      status: "invalid";
      errors: Partial<Record<"name" | "region", SpaceSetupFieldError>>;
    }
  | { status: "duplicate_name"; existing: CreatedSpace }
  | { status: "conflict" }
  | { status: "unavailable"; digest: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeSpaceName(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFC").replace(/\s+/gu, " ").trim()
    : "";
}

/** Field errors in the order the flow asks its questions. */
export function validateSpaceSetup(input: {
  displayName: unknown;
  locationVisibility: unknown;
  coarseRegionCode: unknown;
}): Partial<Record<"name" | "region", SpaceSetupFieldError>> {
  const errors: Partial<Record<"name" | "region", SpaceSetupFieldError>> = {};
  const name = normalizeSpaceName(input.displayName);
  if (!name) errors.name = "name_required";
  else if ([...name].length > SPACE_NAME_MAX_LENGTH)
    errors.name = "name_too_long";
  if (input.locationVisibility === "region") {
    const code =
      typeof input.coarseRegionCode === "string"
        ? normalizeCoarseRegionCode(input.coarseRegionCode)
        : null;
    if (!input.coarseRegionCode) errors.region = "region_required";
    else if (!code || !isCoarseRegionCode(code))
      errors.region = "region_invalid";
  }
  return errors;
}

export class InvalidSpaceSetupRequest extends Error {}

/** The request body, parsed strictly. Field-level problems are returned, not thrown. */
export function parseSpaceSetupRequest(
  raw: unknown,
):
  | { ok: true; input: SpaceSetupInput }
  | {
      ok: false;
      errors: Partial<Record<"name" | "region", SpaceSetupFieldError>>;
    } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new InvalidSpaceSetupRequest();
  }
  const value = raw as Record<string, unknown>;
  if (typeof value.requestId !== "string" || !UUID.test(value.requestId)) {
    throw new InvalidSpaceSetupRequest();
  }
  if (
    value.locationVisibility !== "hidden" &&
    value.locationVisibility !== "region"
  ) {
    throw new InvalidSpaceSetupRequest();
  }
  if (
    typeof value.displayName !== "string" ||
    value.displayName.length > 1000
  ) {
    throw new InvalidSpaceSetupRequest();
  }
  const errors = validateSpaceSetup({
    displayName: value.displayName,
    locationVisibility: value.locationVisibility,
    coarseRegionCode: value.coarseRegionCode,
  });
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    input: {
      requestId: value.requestId.toLowerCase(),
      displayName: normalizeSpaceName(value.displayName),
      locationVisibility: value.locationVisibility,
      coarseRegionCode:
        value.locationVisibility === "region"
          ? normalizeCoarseRegionCode(String(value.coarseRegionCode))
          : null,
      allowDuplicateName: value.allowDuplicateName === true,
    },
  };
}

/**
 * Where a standalone create returns. Only a workspace path, so a crafted link
 * cannot send a gardener off the product with their new space's id.
 */
export function normalizeSpaceSetupReturnTo(value: unknown): string {
  const path = normalizeJournalComposerReturnTo(value, "/garden");
  return path === "/garden" ||
    path.startsWith("/garden/") ||
    path.startsWith("/garden?") ||
    path.startsWith("/garden#")
    ? path
    : "/garden";
}

/** The caller's address with the new space's id, which is what it asked for. */
export function spaceSetupReturnHref(
  returnTo: string,
  spaceId: string,
): string {
  const url = new URL(returnTo, "https://over.garden");
  url.searchParams.set("space", spaceId);
  return `${url.pathname}${url.search}${url.hash}`;
}
