import { afterEach, expect, test, vi } from "vitest";
import { signInSyntheticGardener } from "../tests/helpers/synthetic-gardener";

function harness(signInStatuses: number[]) {
  const signin = vi.fn();
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith("select id"))
      return { rows: [{ id: "00000000-0000-4000-8000-000000000480" }] };
    if (sql.includes("normalized_handle"))
      return { rows: [{ normalized_handle: "synthetic-gardener" }] };
    return { rows: [] };
  });
  const post = vi.fn(async (url: string) => {
    const status = url.includes("sign-up")
      ? 500
      : (signin(), signInStatuses.shift() ?? 500);
    return {
      status: () => status,
      ok: () => status >= 200 && status < 300,
      headers: () => (status === 429 ? { "x-retry-after": "2" } : {}),
    };
  });
  const input = {
    baseURL: "http://127.0.0.1:3188",
    prefix: "ove480",
    context: { request: { post } },
    pool: { query },
  } as unknown as Parameters<typeof signInSyntheticGardener>[0];
  return { input, query, signin };
}
afterEach(() => vi.useRealTimers());

test("a persisted signup survives a rate-limited signin without creating another account", async () => {
  vi.useFakeTimers();
  const fixture = harness([429, 200]);
  const result = signInSyntheticGardener(fixture.input);
  await vi.runAllTimersAsync();
  expect((await result).handle).toBe("synthetic-gardener");
  expect(fixture.signin).toHaveBeenCalledTimes(2);
  expect(
    fixture.query.mock.calls.filter(([sql]) => sql.startsWith("select id")),
  ).toHaveLength(1);
  expect(
    fixture.query.mock.calls.some(([sql]) => sql.startsWith("delete")),
  ).toBe(false);
});

test("a real credential refusal is not retried and cleans the account the caller never received", async () => {
  const fixture = harness([401, 200]);
  await expect(signInSyntheticGardener(fixture.input)).rejects.toThrow(
    "sign-in answered 401",
  );
  expect(fixture.signin).toHaveBeenCalledTimes(1);
  expect(fixture.query).toHaveBeenCalledWith(
    'delete from public."user" where id = $1::uuid',
    ["00000000-0000-4000-8000-000000000480"],
  );
});
