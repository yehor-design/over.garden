/** One input limit for every composer photo (ADR-0022, D2): 50 MB. */
export const MAX_COMPOSER_IMAGE_BYTES = 50 * 1024 * 1024;
export const MAX_COMPOSER_IMAGE_MEGABYTES = 50;

/** Short-side floor for launch-quality public derivatives (OVE-197). */
export const MIN_LAUNCH_MEDIA_SHORT_SIDE_PX = 64;

/** Area floor so flat/tiny placeholders cannot promote as launch media. */
export const MIN_LAUNCH_MEDIA_AREA_PX = MIN_LAUNCH_MEDIA_SHORT_SIDE_PX ** 2;

export const DEFAULT_MEDIA_FOCAL_X = 0.5;
export const DEFAULT_MEDIA_FOCAL_Y = 0.5;

export function isAllowedComposerImageSize(size: number) {
  return Number.isInteger(size) && size > 0 && size <= MAX_COMPOSER_IMAGE_BYTES;
}
