import {
  AUTH_RETRY_ATTEMPTS,
  authRetryDelayMs,
  type AuthResponse,
} from "./auth-rate-limit";

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

/**
 * Signs the sealed owner in, and survives the rate limiter.
 *
 * Better Auth rate-limits the auth endpoints per window, and Playwright runs
 * spec files in parallel — so a sign-in can answer `429` because a *different*
 * spec in the same run signed somebody up a moment earlier. The failure then
 * reads "Run `pnpm owner:seed-browser-fixture` before this spec", which names
 * a cause that is not the cause; it cost CI a red run on 2026-09-18.
 *
 * The retries are the same as `synthetic-gardener.ts`'s — as long as the
 * limiter says (`auth-rate-limit.ts`) — and the error reports the statuses
 * actually seen so the next reader is not misled again.
 */
export async function signInOwnerFixture(input: {
  request: {
    post: (
      url: string,
      options: { headers: Record<string, string>; data: unknown },
    ) => Promise<AuthResponse & { ok: () => boolean }>;
  };
  baseURL: string;
}) {
  const statuses: number[] = [];
  for (let attempt = 0; attempt < AUTH_RETRY_ATTEMPTS; attempt += 1) {
    const response = await input.request.post(
      `${input.baseURL}/api/auth/sign-in/email`,
      {
        headers: { origin: input.baseURL },
        data: {
          email: OWNER_BROWSER_FIXTURE.email,
          password: OWNER_BROWSER_FIXTURE.password,
        },
      },
    );
    if (response.ok()) return;
    statuses.push(response.status());
    const delay = authRetryDelayMs(response, attempt);
    if (delay === null) break;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error(
    `The owner fixture could not sign in (statuses: ${statuses.join(", ")}). ` +
      "A 429 is the rate limiter and another spec in this run; anything else " +
      "means `pnpm owner:seed-browser-fixture` has not been run.",
  );
}
