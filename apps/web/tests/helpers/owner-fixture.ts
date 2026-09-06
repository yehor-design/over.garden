/**
 * The sealed owner the browser proof signs in as (OVE-391).
 *
 * The owner gate is `role = 'owner'` in `admin_user_roles` **and** the user id
 * the server was started with (`OVERGARDEN_ADMIN_OWNER_USER_ID`,
 * `src/server/admin-access.ts`). The server reads that value at start, so the
 * account cannot be created by the spec that needs it to be the owner already:
 * the id is a constant here, `pnpm owner:seed-browser-fixture` writes the
 * account before the server starts, and the same constant goes into the
 * server's environment.
 */
export const OWNER_BROWSER_FIXTURE = {
  userId: "0ce39100-1ce3-4ce3-8ce3-0ce391000391",
  email: "ove391-owner@example.test",
  password: "OVE391-local-owner-1!",
} as const;

export const OWNER_BROWSER_FIXTURE_ENV = "OVERGARDEN_ADMIN_OWNER_USER_ID";
