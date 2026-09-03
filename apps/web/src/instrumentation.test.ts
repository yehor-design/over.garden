import { describe, expect, it, vi } from "vitest";

import { postgresRejection } from "@test/postgres-rejection";
import { buildWorkspaceErrorLogLine, onRequestError } from "./instrumentation";

const REQUEST = {
  path: "/garden/catalog/registry?token=private-value",
  method: "GET",
};

const CONTEXT = {
  routerKind: "App Router",
  routePath: "/(default)/garden/catalog/registry",
  routeType: "render",
  renderSource: "react-server-components",
  renderType: "dynamic-resume",
};

describe("onRequestError", () => {
  it("records the bounded class and the digest for a rejected workspace read", () => {
    const line = buildWorkspaceErrorLogLine(
      Object.assign(postgresRejection("42P01"), { digest: "1234567890" }),
      REQUEST,
      CONTEXT,
    );

    expect(line).toEqual({
      event: "workspace_server_error",
      digest: "1234567890",
      path: "/garden/catalog/registry",
      method: "GET",
      routerKind: "App Router",
      routePath: "/(default)/garden/catalog/registry",
      routeType: "render",
      renderSource: "react-server-components",
      renderType: "dynamic-resume",
      revalidateReason: null,
      failureClass: "schema_missing",
    });
  });

  it("never records a query string, a message, or a bound parameter", () => {
    const line = buildWorkspaceErrorLogLine(
      postgresRejection(
        "42501",
        'permission denied for relation journal_entries: body="a private note"',
      ),
      REQUEST,
      CONTEXT,
    );
    const serialized = JSON.stringify(line);

    expect(line.path).toBe("/garden/catalog/registry");
    expect(serialized).not.toContain("token=private-value");
    expect(serialized).not.toContain("a private note");
    expect(serialized).not.toContain("permission denied for relation");
    expect(line.failureClass).toBe("permission_denied");
  });

  it("reports no class rather than guessing for a non-database error", () => {
    const line = buildWorkspaceErrorLogLine(
      new Error("a cause with no code at all"),
      REQUEST,
      CONTEXT,
    );

    expect(line.failureClass).toBeNull();
    expect(line.digest).toMatch(/^[0-9A-Z]{7,}$/);
  });

  it("writes exactly one JSON line", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      onRequestError(postgresRejection("ECONNREFUSED"), REQUEST, CONTEXT);

      expect(error).toHaveBeenCalledTimes(1);
      const [written] = error.mock.calls[0] as [string];
      expect(written).not.toContain("\n");
      expect(JSON.parse(written)).toMatchObject({
        event: "workspace_server_error",
        failureClass: "connection_unavailable",
      });
    } finally {
      error.mockRestore();
    }
  });
});
