/**
 * Better Auth requires a non-empty `user.name` during email registration.
 * This locale-neutral value is private compatibility data only. The database
 * hook enforces it for every new provider user, so request/provider names can
 * never become an OverGarden public identity.
 */
export const PRIVATE_AUTH_COMPATIBILITY_NAME = "OverGarden";
