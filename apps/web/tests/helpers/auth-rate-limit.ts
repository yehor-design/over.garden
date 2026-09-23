/**
 * How long to wait before asking an auth endpoint again after it said no.
 *
 * Better Auth lets three requests through to a sign-in or sign-up path per
 * address per ten seconds, and the window slides: every request it lets
 * through starts it again for everyone else. The gate runs two workers against
 * one server from one address, so a fixed schedule can land inside a fresh
 * window on every try — a spec failed on four 429s in a row while the other
 * worker was signing people in. The 429 names the wait (`X-Retry-After`, in
 * seconds); taking it, plus a jitter that keeps two workers from retrying in
 * step, is what gets through. A 429 is a window, not a verdict.
 */
export const AUTH_RETRY_ATTEMPTS = 6;

const FALLBACK_DELAYS_MS = [1_500, 4_000, 9_000, 10_000, 10_000] as const;

export interface AuthResponse {
  status(): number;
  headers(): Record<string, string>;
}

/** The wait before attempt `attempt + 1`, or `null` when attempts are spent. */
export function authRetryDelayMs(
  response: AuthResponse,
  attempt: number,
): number | null {
  const fallback = FALLBACK_DELAYS_MS[attempt];
  if (fallback === undefined) return null;
  const named = Number(response.headers()["x-retry-after"]);
  const wait =
    response.status() === 429 && Number.isFinite(named) && named > 0
      ? named * 1_000 + 250
      : fallback;
  return wait + Math.floor(Math.random() * 1_000);
}

/**
 * Posts until the limiter lets the request through, waiting as long as each
 * 429 says. Any other answer — a success, or a refusal that is real — comes
 * back at once, with every status seen, for the caller to judge.
 */
export async function postPastRateLimit<Answer extends AuthResponse>(
  post: () => Promise<Answer>,
): Promise<{ response: Answer; statuses: number[] }> {
  const statuses: number[] = [];
  for (let attempt = 0; ; attempt += 1) {
    const response = await post();
    statuses.push(response.status());
    if (response.status() !== 429) return { response, statuses };
    const delay = authRetryDelayMs(response, attempt);
    if (delay === null) return { response, statuses };
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
