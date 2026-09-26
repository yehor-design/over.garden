import {
  EPHEMERAL_MEDIA_MAX_OBJECTS_PER_PHOTO,
  isEphemeralMediaPlaceholderDataUri,
  isUuid,
} from "@/lib/media/ephemeral-staging-contract";

/**
 * The one photo a space or a plant or animal carries (ADR-0036 D1,
 * DESIGN.md §5.25), as the browser hands it over: the staging session it was
 * uploaded in, its id, the staging receipts of its primary WebP and its
 * variants (primary first), and the 16 px placeholder the encoder made.
 *
 * The receipts are the Worker's signed tokens; the server verifies them when
 * it claims the photo, so here only their shape is checked.
 */
export interface OwnedPhotoPayload {
  stagingSessionId: string;
  mediaAssetId: string;
  receipts: string[];
  placeholder: string | null;
}

export class InvalidOwnedPhotoPayload extends Error {
  constructor() {
    super("owned_photo_invalid");
    this.name = "InvalidOwnedPhotoPayload";
  }
}

/** `undefined` and `null` mean "no photo"; anything else must be a whole payload. */
export function parseOwnedPhotoPayload(value: unknown): OwnedPhotoPayload | null {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidOwnedPhotoPayload();
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set(["stagingSessionId", "mediaAssetId", "receipts", "placeholder"]);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new InvalidOwnedPhotoPayload();
  }
  const receipts = record.receipts;
  if (
    !isUuid(record.stagingSessionId) ||
    !isUuid(record.mediaAssetId) ||
    !Array.isArray(receipts) ||
    receipts.length < 1 ||
    receipts.length > EPHEMERAL_MEDIA_MAX_OBJECTS_PER_PHOTO ||
    receipts.some(
      (token) => typeof token !== "string" || token.length < 40 || token.length > 4096,
    ) ||
    !(
      record.placeholder === undefined ||
      record.placeholder === null ||
      isEphemeralMediaPlaceholderDataUri(record.placeholder)
    )
  ) {
    throw new InvalidOwnedPhotoPayload();
  }
  return {
    stagingSessionId: record.stagingSessionId.toLowerCase(),
    mediaAssetId: record.mediaAssetId.toLowerCase(),
    receipts: receipts as string[],
    placeholder: typeof record.placeholder === "string" ? record.placeholder : null,
  };
}

/** A photo as a page draws it: the address, its variants, its size and its blur. */
export interface OwnedPhotoView {
  src: string;
  srcSet: string | null;
  width: number | null;
  height: number | null;
  placeholderDataUri: string | null;
}
