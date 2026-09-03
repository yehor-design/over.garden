import { describe, expect, it, vi } from "vitest";

import { postgresRejection } from "@test/postgres-rejection";
import {
  classifyWorkspaceFailure,
  describeWorkspaceFailure,
  failedSection,
  settleSection,
  WORKSPACE_FAILURE_CLASSES,
  workspaceFailureDigest,
  workspaceSectionDeadlineMs,
  WORKSPACE_SECTION_DEADLINE_MS,
} from "./workspace-failure";

describe("workspace failure vocabulary", () => {
  it.each([
    ["42501", "permission_denied"],
    ["42P01", "schema_missing"],
    ["42703", "schema_missing"],
    ["57014", "query_timeout"],
    ["08006", "connection_unavailable"],
    ["ECONNREFUSED", "connection_unavailable"],
    ["40001", "serialization_failure"],
    ["workspace_section_deadline", "query_timeout"],
  ] as const)("maps %s onto %s", (code, expected) => {
    expect(classifyWorkspaceFailure(postgresRejection(code))).toBe(expected);
  });

  it("reports unknown rather than guessing, and never widens the closed set", () => {
    expect(classifyWorkspaceFailure(new Error("no code at all"))).toBe(
      "unknown",
    );
    expect(classifyWorkspaceFailure(postgresRejection("XX000"))).toBe(
      "unknown",
    );
    expect(WORKSPACE_FAILURE_CLASSES).toEqual([
      "permission_denied",
      "schema_missing",
      "query_timeout",
      "connection_unavailable",
      "serialization_failure",
      "unknown",
    ]);
  });

  it("treats an AbortError as a timeout even without a code", () => {
    const aborted = new Error("aborted");
    aborted.name = "AbortError";
    expect(classifyWorkspaceFailure(aborted)).toBe("query_timeout");
  });
});

describe("describeWorkspaceFailure", () => {
  it("gives the same digest to the same class and code, and a different one otherwise", () => {
    const first = describeWorkspaceFailure(postgresRejection("42P01"));
    const second = describeWorkspaceFailure(postgresRejection("42P01"));
    const other = describeWorkspaceFailure(postgresRejection("42703"));

    expect(first.digest).toBe(second.digest);
    expect(first.digest).not.toBe(other.digest);
    expect(first.digest).toBe(
      workspaceFailureDigest("schema_missing", "42P01"),
    );
  });

  it("names the missing relation, and only for a missing relation", () => {
    expect(
      describeWorkspaceFailure(
        postgresRejection(
          "42P01",
          'relation "foundation_releases" does not exist',
        ),
      ).relation,
    ).toBe("foundation_releases");
    expect(
      describeWorkspaceFailure(
        postgresRejection("42501", 'relation "journal_entries" does not exist'),
      ).relation,
    ).toBeNull();
  });

  it("cannot capture journal text out of a driver message", () => {
    const described = describeWorkspaceFailure(
      postgresRejection(
        "42P01",
        'relation "Мої помідори зацвіли" does not exist',
      ),
    );

    expect(described.relation).toBeNull();
    expect(JSON.stringify(described)).not.toContain("помідори");
  });
});

describe("settleSection", () => {
  it("returns the value when the read succeeds", async () => {
    await expect(settleSection(async () => 7)).resolves.toEqual({
      status: "ready",
      value: 7,
    });
  });

  it("turns a rejection into a rendered value instead of throwing", async () => {
    const settled = await settleSection(
      () =>
        Promise.reject(
          postgresRejection("42P01", 'relation "x" does not exist'),
        ),
      { record: false },
    );

    expect(settled).toEqual(
      failedSection("schema_missing", { code: "42P01", relation: "x" }),
    );
  });

  it("records one labelled line for a degraded section, and none for a ready one", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await settleSection(async () => 1, {
        surface: "profile",
        section: "owner-workspace",
      });
      expect(error).not.toHaveBeenCalled();

      await settleSection(() => Promise.reject(postgresRejection("42501")), {
        surface: "profile",
        section: "owner-workspace",
      });

      expect(error).toHaveBeenCalledTimes(1);
      const [written] = error.mock.calls[0] as [string];
      expect(JSON.parse(written)).toEqual({
        event: "workspace_section_degraded",
        surface: "profile",
        section: "owner-workspace",
        failureClass: "permission_denied",
        digest: failedSection("permission_denied", { code: "42501" }).digest,
      });
    } finally {
      error.mockRestore();
    }
  });

  it("stays silent for a read whose failure is a designed absence", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await settleSection(() => Promise.reject(postgresRejection("42501")), {
        record: false,
      });
      expect(error).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  it("never lets the record itself break a render", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("log sink is down");
    });
    try {
      await expect(
        settleSection(() => Promise.reject(postgresRejection("42501"))),
      ).resolves.toMatchObject({ failureClass: "permission_denied" });
    } finally {
      error.mockRestore();
    }
  });

  it("settles a read that never answers at its own deadline", async () => {
    vi.useFakeTimers();
    try {
      const pending = settleSection(() => new Promise<number>(() => {}), {
        deadlineMs: workspaceSectionDeadlineMs(2),
        record: false,
      });
      await vi.advanceTimersByTimeAsync(workspaceSectionDeadlineMs(2));

      expect(await pending).toEqual(
        failedSection("query_timeout", {
          code: "workspace_section_deadline",
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-throws a control-flow signal the caller names, and nothing else", async () => {
    const notFound = Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), {
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    const rethrow = (reason: unknown) => {
      if (reason === notFound) throw reason;
    };

    await expect(
      settleSection(() => Promise.reject(notFound), {
        rethrow,
        record: false,
      }),
    ).rejects.toBe(notFound);
    await expect(
      settleSection(() => Promise.reject(postgresRejection("42P01")), {
        rethrow,
        record: false,
      }),
    ).resolves.toMatchObject({ failureClass: "schema_missing" });
  });

  it("derives a section budget from its own round-trip cost", () => {
    expect(workspaceSectionDeadlineMs(1)).toBe(WORKSPACE_SECTION_DEADLINE_MS);
    expect(workspaceSectionDeadlineMs(4)).toBe(
      WORKSPACE_SECTION_DEADLINE_MS * 4,
    );
    expect(workspaceSectionDeadlineMs(0)).toBe(WORKSPACE_SECTION_DEADLINE_MS);
  });
});
