import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ register: vi.fn() }));

vi.mock("@/lib/interface-locale-change-coordinator", () => ({
  interfaceLocaleChangeCoordinator: { register: mocks.register },
}));

import { InterfaceSafeFlushFailureFixture } from "./interface-safe-flush-failure-fixture";

describe("localization safe-flush failure fixture", () => {
  it("registers one payload-free deterministic failure and unregisters it", async () => {
    const unregister = vi.fn();
    mocks.register.mockReturnValueOnce(unregister);
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(<InterfaceSafeFlushFailureFixture />);
    });

    expect(mocks.register).toHaveBeenCalledOnce();
    const participant = mocks.register.mock.calls[0]?.[0];
    expect(participant).toMatchObject({
      id: "visual-fixture:safe-flush-failure",
      kind: "safe-flush",
    });
    await expect(participant.prepare()).rejects.toThrow(
      "Deterministic safe-flush failure fixture.",
    );

    await act(async () => renderer!.unmount());
    expect(unregister).toHaveBeenCalledOnce();
  });
});
