import "server-only";

// This protocol value is consumed by the owner-scoped repository while the
// decoder itself stays isolated in safe-media-admission.ts. Keep this module
// free of native imports so garden SSR never needs to load sharp.
export const SAFE_MEDIA_PROCESSING_LEASE_SECONDS = 90;
