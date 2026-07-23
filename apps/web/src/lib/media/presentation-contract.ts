/**
 * OVE-197 subject-aware media presentation contract.
 * Pure helpers only — never accept raw CSS strings from clients.
 */

export type MediaPresentationMode = "cover" | "contain";

export interface MediaFocalPoint {
  x: number;
  y: number;
}

export interface MediaIntrinsicSize {
  width: number | null;
  height: number | null;
}

export interface ResolvedMediaPresentation {
  mode: MediaPresentationMode;
  objectFitClass: "object-cover" | "object-contain";
  /** Safe CSS object-position value, e.g. "50% 50%". Never from raw input. */
  objectPosition: string;
  focal: MediaFocalPoint;
  intrinsic: MediaIntrinsicSize;
}

export const MEDIA_FOCAL_CENTER: MediaFocalPoint = { x: 0.5, y: 0.5 };

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Clamp focal to [0,1]. Invalid / out-of-range values fail closed to center.
 */
export function normalizeFocalPoint(
  input?: Partial<MediaFocalPoint> | null,
): MediaFocalPoint {
  if (!input || !isFiniteNumber(input.x) || !isFiniteNumber(input.y)) {
    return { ...MEDIA_FOCAL_CENTER };
  }
  if (input.x < 0 || input.x > 1 || input.y < 0 || input.y > 1) {
    return { ...MEDIA_FOCAL_CENTER };
  }
  return { x: input.x, y: input.y };
}

/**
 * Build a safe CSS object-position percentage pair from normalized focal.
 * Never interpolate untrusted strings.
 */
export function objectPositionCss(focal: MediaFocalPoint): string {
  const safe = normalizeFocalPoint(focal);
  const xPct = Math.round(safe.x * 1000) / 10;
  const yPct = Math.round(safe.y * 1000) / 10;
  return `${xPct}% ${yPct}%`;
}

export function resolveMediaPresentation(input: {
  mode: MediaPresentationMode;
  focal?: Partial<MediaFocalPoint> | null;
  intrinsic?: Partial<MediaIntrinsicSize> | null;
}): ResolvedMediaPresentation {
  const focal = normalizeFocalPoint(input.focal);
  const width =
    input.intrinsic && isFiniteNumber(input.intrinsic.width)
      ? Math.trunc(input.intrinsic.width)
      : null;
  const height =
    input.intrinsic && isFiniteNumber(input.intrinsic.height)
      ? Math.trunc(input.intrinsic.height)
      : null;

  if (input.mode === "contain") {
    return {
      mode: "contain",
      objectFitClass: "object-contain",
      // Contain shows the whole image; position is irrelevant but still safe.
      objectPosition: objectPositionCss(MEDIA_FOCAL_CENTER),
      focal,
      intrinsic: { width, height },
    };
  }

  return {
    mode: "cover",
    objectFitClass: "object-cover",
    objectPosition: objectPositionCss(focal),
    focal,
    intrinsic: { width, height },
  };
}
