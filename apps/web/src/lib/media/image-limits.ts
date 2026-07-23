export const MAX_COMPOSER_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_COMPOSER_IMAGE_MEGABYTES = 12;
export const MAX_IMAGE_INPUT_PIXELS = 40_000_000;

/** Short-side floor for launch-quality public derivatives (OVE-197). */
export const MIN_LAUNCH_MEDIA_SHORT_SIDE_PX = 64;

/** Area floor so flat/tiny placeholders cannot promote as launch media. */
export const MIN_LAUNCH_MEDIA_AREA_PX = MIN_LAUNCH_MEDIA_SHORT_SIDE_PX ** 2;

export const DEFAULT_MEDIA_FOCAL_X = 0.5;
export const DEFAULT_MEDIA_FOCAL_Y = 0.5;

export function isAllowedComposerImageSize(size: number) {
  return Number.isInteger(size) && size > 0 && size <= MAX_COMPOSER_IMAGE_BYTES;
}

export function meetsLaunchMediaQuality(input: {
  width: number;
  height: number;
}): boolean {
  const width = Math.trunc(Number(input.width));
  const height = Math.trunc(Number(input.height));
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  if (width < 1 || height < 1) return false;
  const shortSide = Math.min(width, height);
  if (shortSide < MIN_LAUNCH_MEDIA_SHORT_SIDE_PX) return false;
  return width * height >= MIN_LAUNCH_MEDIA_AREA_PX;
}
