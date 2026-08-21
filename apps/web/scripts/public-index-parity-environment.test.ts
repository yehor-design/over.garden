import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { preparePublicIndexParityEnvironment } from "./public-index-parity-environment";

describe("public index parity environment isolation", () => {
  it("refuses production when the invocation cwd contains .env.local", () => {
    const loadEnvFile = vi.fn();

    expect(() =>
      preparePublicIndexParityEnvironment(
        ["--environment", "production", "--confirm-environment", "production"],
        {
          cwd: "/workspace/apps/web",
          envFileExists: () => true,
          loadEnvFile,
        },
      ),
    ).toThrow("Production parity requires an isolated cwd without .env.local");
    expect(loadEnvFile).not.toHaveBeenCalled();
  });

  it("does not load dotenv for an isolated production invocation", () => {
    const loadEnvFile = vi.fn();

    expect(
      preparePublicIndexParityEnvironment(
        ["--environment", "production", "--confirm-environment", "production"],
        {
          cwd: "/tmp/isolated-operator",
          environment: {
            OVERGARDEN_PRODUCTION_PARITY_ISOLATED: "1",
          },
          envFileExists: () => false,
          loadEnvFile,
        },
      ),
    ).toEqual({ environment: "production", loadedEnvFile: false });
    expect(loadEnvFile).not.toHaveBeenCalled();
  });

  it("refuses an unmarked production process even when its cwd is empty", () => {
    expect(() =>
      preparePublicIndexParityEnvironment(
        ["--environment", "production", "--confirm-environment", "production"],
        {
          cwd: "/tmp/unverified-operator",
          environment: {},
          envFileExists: () => false,
          loadEnvFile: vi.fn(),
        },
      ),
    ).toThrow("Production parity requires the isolated production wrapper");
  });

  it("retains the local dotenv bootstrap from the invocation cwd", () => {
    const loadEnvFile = vi.fn();

    expect(
      preparePublicIndexParityEnvironment(
        ["--environment", "local", "--confirm-environment", "local"],
        {
          cwd: "/workspace/apps/web",
          envFileExists: () => true,
          loadEnvFile,
        },
      ),
    ).toEqual({ environment: "local", loadedEnvFile: true });
    expect(loadEnvFile).toHaveBeenCalledOnce();
    expect(loadEnvFile).toHaveBeenCalledWith({
      path: path.join("/workspace/apps/web", ".env.local"),
    });
  });
});
