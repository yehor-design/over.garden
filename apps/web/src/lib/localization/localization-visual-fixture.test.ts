import { describe, expect, it } from "vitest";

import {
  isInterfaceGlobalErrorVisualFixtureRequest,
  isInterfaceServerActionPendingVisualFixtureRequest,
  isInterfaceServerActionPendingVisualFixtureSearchParams,
} from "./localization-visual-fixture";

describe("localization visual fixture gates", () => {
  it("accepts only one semantically exact global-error query", () => {
    for (const value of [
      "http://localhost:3000/garden?visualLocaleState=global-error",
      "http://localhost:3000/garden?visualLocaleState=%67lobal-error",
    ]) {
      expect(isInterfaceGlobalErrorVisualFixtureRequest(new URL(value))).toBe(
        true,
      );
    }

    for (const value of [
      "http://localhost:3000/bg/garden?visualLocaleState=global-error",
      "http://localhost:3000/garden?visualLocaleState=global-error&page=1",
      "http://localhost:3000/garden?visualLocaleState=global-error&visualLocaleState=global-error",
      "http://localhost:3000/garden?visualLocaleState=other",
      "http://localhost:3000/garden?visualLocaleState=global-error#main-content",
    ]) {
      expect(isInterfaceGlobalErrorVisualFixtureRequest(new URL(value))).toBe(
        false,
      );
    }
  });

  it("accepts only the exact scalar Server Action pending query", () => {
    expect(
      isInterfaceServerActionPendingVisualFixtureSearchParams({
        visualLocaleState: "server-action-pending",
      }),
    ).toBe(true);
    expect(
      isInterfaceServerActionPendingVisualFixtureSearchParams({
        visualLocaleState: ["server-action-pending", "server-action-pending"],
      }),
    ).toBe(false);
    expect(
      isInterfaceServerActionPendingVisualFixtureSearchParams({
        visualLocaleState: "server-action-pending",
        page: "1",
      }),
    ).toBe(false);
    expect(
      isInterfaceServerActionPendingVisualFixtureSearchParams({
        visualLocaleState: "safe-flush-failure",
      }),
    ).toBe(false);
  });

  it("accepts only the exact current-route URL inside the Server Action", () => {
    expect(
      isInterfaceServerActionPendingVisualFixtureRequest(
        new URL(
          "http://localhost:3000/garden?visualLocaleState=server-action-pending",
        ),
      ),
    ).toBe(true);

    for (const value of [
      "http://localhost:3000/bg/garden?visualLocaleState=server-action-pending",
      "http://localhost:3000/garden?visualLocaleState=server-action-pending&page=1",
      "http://localhost:3000/garden?visualLocaleState=%73erver-action-pending",
      "http://localhost:3000/garden?visualLocaleState=server-action-pending#main-content",
    ]) {
      expect(
        isInterfaceServerActionPendingVisualFixtureRequest(new URL(value)),
      ).toBe(false);
    }
  });
});
