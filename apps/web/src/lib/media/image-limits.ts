export const MAX_COMPOSER_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_COMPOSER_IMAGE_MEGABYTES = 12;
export const MAX_IMAGE_INPUT_PIXELS = 40_000_000;

export function isAllowedComposerImageSize(size: number) {
  return Number.isInteger(size) && size > 0 && size <= MAX_COMPOSER_IMAGE_BYTES;
}
