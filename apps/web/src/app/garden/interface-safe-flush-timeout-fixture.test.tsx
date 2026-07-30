import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ register: vi.fn() }));

vi.mock("@/lib/interface-locale-change-coordinator", () => ({
  interfaceLocaleChangeCoordinator: { register: mocks.register },
}));

import { InterfaceSafeFlushTimeoutFixture } from "./interface-safe-flush-timeout-fixture";

describe("bounded locale visual fault fixture", () => {
  beforeEach(() => {
    mocks.register.mockReset();
    mocks.register.mockReturnValue(() => undefined);
  });

  it("exposes a synchronous recovery handle before its durable flush stalls", async () => {
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<InterfaceSafeFlushTimeoutFixture />);
    });

    const participant = mocks.register.mock.calls[0]?.[0];
    expect(participant).toMatchObject({
      id: "visual-fixture:safe-flush-timeout",
      kind: "safe-flush",
    });
    const preparation = participant.prepare();
    expect(preparation).toMatchObject({
      cancel: expect.any(Function),
      resume: expect.any(Function),
    });
    let settled = false;
    void preparation.ready.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    await expect(preparation.cancel()).resolves.toBeUndefined();
    expect(
      renderer!.root.findByProps({
        "data-interface-safe-flush-timeout-fixture": "true",
      }),
    ).toBeDefined();
    await act(async () => renderer!.unmount());
  });
});
