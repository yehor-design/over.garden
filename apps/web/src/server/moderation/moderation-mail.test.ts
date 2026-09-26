import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ selectFrom: vi.fn() }));
vi.mock("@/db", () => ({ db: { selectFrom: mocks.selectFrom } }));

import { drainModerationMessages } from "./moderation-mail";

describe("the complaint procedure's outbox", () => {
  it("attempts nothing and marks nothing where no mail provider is configured", async () => {
    await expect(
      drainModerationMessages({
        env: { RESEND_API_KEY: "", RESEND_AUTH_FROM: "" },
      }),
    ).resolves.toEqual({ sent: 0, failed: 0, unconfigured: true });
    expect(mocks.selectFrom).not.toHaveBeenCalled();
  });
});
