import { randomUUID } from "node:crypto";

import {
  expect,
  type APIRequestContext,
  type BrowserContext,
} from "playwright/test";
import type { Pool } from "pg";

import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../../src/lib/auth/public-identity-compatibility";
import { AUTH_RETRY_ATTEMPTS, authRetryDelayMs } from "./auth-rate-limit";

/**
 * A gardener with a session, for a browser proof that needs one.
 *
 * Two facts about this flow that cost an evening between them.
 *
 * **Sign-up answers 500 and still works.** The user and credential rows are
 * written before the verification mail is sent, and a local run has no mail
 * provider, so the request fails after the row exists. The row is the fact a
 * proof needs, which is why the status is not asserted.
 *
 * **Better Auth rate-limits sign-up.** Measured against a production build on
 * 2026-09-17: the fourth call in a window answers `429` and writes nothing.
 * Playwright runs spec *files* in parallel, so several specs signing a
 * gardener in at once used to push one of them over the limit — and the
 * failure read "Synthetic gardener was not persisted", which names the symptom
 * and hides the cause. This retries for as long as the limiter says to
 * (`auth-rate-limit.ts`), and says what it saw if it gives up.
 */

export const SYNTHETIC_GARDENER_PASSWORD = "OverGarden-local-password-1!";

export interface SyntheticGardener {
  id: string;
  email: string;
  /** The handle sign-up claimed in `user_handle_registry`. */
  handle: string;
}

export async function signInSyntheticGardener(input: {
  baseURL: string;
  context: BrowserContext | { request: APIRequestContext };
  pool: Pool;
  /** A prefix so a run's rows are recognisable and cleanable. */
  prefix: string;
  password?: string;
}): Promise<SyntheticGardener> {
  const password = input.password ?? SYNTHETIC_GARDENER_PASSWORD;
  const email = `${input.prefix}-${randomUUID()}@example.test`;
  const request = input.context.request;
  const statuses: number[] = [];

  for (let attempt = 0; attempt < AUTH_RETRY_ATTEMPTS; attempt += 1) {
    const response = await request.post(
      `${input.baseURL}/api/auth/sign-up/email`,
      {
        headers: { origin: input.baseURL },
        data: { email, password, name: PRIVATE_AUTH_COMPATIBILITY_NAME },
      },
    );
    statuses.push(response.status());

    const user = await input.pool.query<{ id: string }>(
      'select id::text as id from public."user" where email = $1::text',
      [email],
    );
    const id = user.rows[0]?.id;
    if (id) {
      await input.pool.query(
        'update public."user" set "emailVerified" = true where id = $1::uuid',
        [id],
      );
      // Sign-in shares the same limiter as concurrent fixture accounts. A
      // persisted signup does not mean its immediately following signin is admitted.
      const signInStatuses: number[] = [];
      let signedIn = false;
      for (let attempt = 0; attempt < AUTH_RETRY_ATTEMPTS; attempt++) {
        const response = await request.post(
          `${input.baseURL}/api/auth/sign-in/email`,
          {
            headers: { origin: input.baseURL },
            data: { email, password },
          },
        );
        signInStatuses.push(response.status());
        if (response.ok()) {
          signedIn = true;
          break;
        }
        const delay = authRetryDelayMs(response, attempt);
        if (response.status() !== 429 || delay === null) break;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      if (!signedIn) {
        // The caller never received this ID, so it cannot clean this account.
        await input.pool.query(
          'delete from public."user" where id = $1::uuid',
          [id],
        );
      }
      expect(
        signedIn,
        `sign-in answered ${signInStatuses.join(", ")} for ${email}`,
      ).toBe(true);

      const claimed = await input.pool.query<{ normalized_handle: string }>(
        `select normalized_handle from user_handle_registry
         where user_id = $1::uuid and lifecycle_state = 'current' limit 1`,
        [id],
      );
      const handle = claimed.rows[0]?.normalized_handle;
      if (!handle) throw new Error(`${email} holds no current handle.`);
      return { id, email, handle };
    }

    const delay = authRetryDelayMs(response, attempt);
    if (delay === null) break;
    // A 429 is a window, not a verdict. Waiting it out is the whole fix.
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw new Error(
    `Synthetic gardener ${email} was not persisted after ` +
      `${statuses.length} attempts (statuses ${statuses.join(", ")}). ` +
      "A 429 there is Better Auth's sign-up rate limit; a 500 with no row is " +
      "something else.",
  );
}

/** Removes a run's gardener, and the rows that hang from them. */
export async function removeSyntheticGardener(pool: Pool, id: string | null) {
  if (!id) return;
  await pool.query('delete from public."user" where id = $1::uuid', [id]);
}
