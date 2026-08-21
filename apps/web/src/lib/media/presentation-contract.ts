/**
 * OVE-197 subject-aware media presentation contract.
 * Pure helpers only — never accept raw CSS strings from clients.
 */

export type MediaPresentationMode = "cover" | "contain";

export const OVE330_SERVE_CLASS_VERSION = "ove330.serveClass.v1" as const;
export const OVE330_SERVE_CLASSES = [
  "exact",
  "clamped",
  "low_confidence",
  "generated",
  "homonymous",
  "probe_missing",
  "seam_unmet",
] as const;
export type Ove330ServeClass = (typeof OVE330_SERVE_CLASSES)[number];

export function isOve330ServeClass(value: unknown): value is Ove330ServeClass {
  return OVE330_SERVE_CLASSES.includes(value as Ove330ServeClass);
}

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
  serveClass: "exact" | "clamped";
}

export const MEDIA_FOCAL_CENTER: MediaFocalPoint = { x: 0.5, y: 0.5 };

export interface ResolvedMediaFocalPoint {
  focal: MediaFocalPoint;
  serveClass: "exact" | "clamped";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Clamp focal to [0,1]. Invalid / out-of-range values fail closed to center.
 */
export function normalizeFocalPoint(
  input?: Partial<MediaFocalPoint> | null,
): MediaFocalPoint {
  return resolveMediaFocalPoint(input).focal;
}

/**
 * Resolve presentation-time focal input without mutating the stored value.
 * Missing, non-finite, and out-of-range values are served at centre and are
 * explicitly distinguishable from an exact focal point by every caller.
 */
export function resolveMediaFocalPoint(
  input?: Partial<MediaFocalPoint> | null,
): ResolvedMediaFocalPoint {
  if (!input || !isFiniteNumber(input.x) || !isFiniteNumber(input.y)) {
    return { focal: { ...MEDIA_FOCAL_CENTER }, serveClass: "clamped" };
  }
  if (input.x < 0 || input.x > 1 || input.y < 0 || input.y > 1) {
    return { focal: { ...MEDIA_FOCAL_CENTER }, serveClass: "clamped" };
  }
  return { focal: { x: input.x, y: input.y }, serveClass: "exact" };
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
  const focalResolution = resolveMediaFocalPoint(input.focal);
  const focal = focalResolution.focal;
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
      serveClass: focalResolution.serveClass,
    };
  }

  return {
    mode: "cover",
    objectFitClass: "object-cover",
    objectPosition: objectPositionCss(focal),
    focal,
    intrinsic: { width, height },
    serveClass: focalResolution.serveClass,
  };
}
