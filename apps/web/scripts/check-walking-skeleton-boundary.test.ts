import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  assertWalkingSkeletonBoundary,
  scanWalkingSkeletonBoundary,
  scanWalkingSkeletonBoundaryWithSyntheticMarkers,
  type WalkingSkeletonBoundaryMarkerFixture,
  type WalkingSkeletonBoundaryOptions,
} from "./check-walking-skeleton-boundary";

const SYNTHETIC_MARKERS = [
  {
    markerClass: "shared-skeleton-email",
    value: "fixture-alpha@identity.invalid",
  },
  {
    markerClass: "shared-skeleton-password",
    value: "Fixture-Credential-Alpha-91!",
  },
  {
    markerClass: "shared-skeleton-account-name",
    matchContext: "account-name-initializer",
    value: "Synthetic Alpha Account",
  },
  {
    markerClass: "shared-local-dev-email",
    value: "fixture-beta@identity.invalid",
  },
  {
    markerClass: "shared-local-dev-password",
    value: "Fixture-Credential-Beta-73!",
  },
  {
    markerClass: "shared-local-dev-account-name",
    value: "Synthetic Beta Account",
  },
  {
    markerClass: "legacy-skeleton-server-action-symbol",
    value: "retiredFixtureJournalMutation",
  },
  {
    markerClass: "legacy-skeleton-server-action-path",
    value: "fixtures/retired/action-module",
  },
  {
    markerClass: "retired-auth-component-symbol",
    value: "RetiredFixtureAuthSurface",
  },
  {
    markerClass: "legacy-walking-auth-component-module",
    value: "retired-fixture-auth-surface",
  },
  {
    markerClass: "legacy-local-dev-default-prefix",
    value: "FIXTURE_RETIRED_DEFAULT_",
  },
] as const satisfies readonly WalkingSkeletonBoundaryMarkerFixture[];

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("walking-skeleton credential boundary", () => {
  it("passes its own repository source with production digest markers and no self allowlist", () => {
    const repositoryRoot = createRepository();
    writeRepositoryFile(
      repositoryRoot,
      "safe.ts",
      "export const safe = true;\n",
    );

    const report = scanWalkingSkeletonBoundary({ repositoryRoot });

    expect(report).toMatchObject({ buildFileCount: 0, findings: [] });
    expect(report.repositoryFileCount).toBe(1);
    expect(() => assertWalkingSkeletonBoundary(report)).not.toThrow();
  });

  it("detects an exact synthetic identity without returning its value", () => {
    const repositoryRoot = createRepository();
    const forbiddenValue = fixtureValue("shared-skeleton-email");
    writeRepositoryFile(
      repositoryRoot,
      "src/diagnostic.ts",
      `export const account = ${JSON.stringify(forbiddenValue)};\n`,
    );

    const report = scanFixtureBoundary({ repositoryRoot });
    const serialized = JSON.stringify(report);

    expect(report.findings).toEqual([
      {
        markerClass: "shared-skeleton-email",
        relativePath: "src/diagnostic.ts",
        surface: "repository-source",
      },
    ]);
    expect(serialized).not.toContain(forbiddenValue);
    expect(() => assertWalkingSkeletonBoundary(report)).toThrow(
      "Walking-skeleton credential boundary failed: shared-skeleton-email [repository-source] src/diagnostic.ts.",
    );
  });

  it.each([
    [
      "escaped string literal",
      () =>
        `export const account = ${escapedStringLiteral(
          fixtureValue("shared-skeleton-email"),
        )};\n`,
    ],
    [
      "binary concatenation",
      () =>
        `export const account = ${binaryConcatenation(
          fixtureValue("shared-skeleton-email"),
        )};\n`,
    ],
    [
      "template interpolation",
      () => {
        const value = fixtureValue("shared-skeleton-email");
        const [left, right] = splitValue(value);
        return `const local = ${JSON.stringify(left)}; export const account = \`${"${local}"}${right}\`;\n`;
      },
    ],
    [
      "array join",
      () =>
        `export const account = ${joinedArrayExpression(
          fixtureValue("shared-skeleton-email"),
        )};\n`,
    ],
    [
      "const identifier indirection",
      () => {
        const value = fixtureValue("shared-skeleton-email");
        const [left, right] = splitValue(value);
        return `const left = ${JSON.stringify(left)}; const right = ${JSON.stringify(right)}; const combined = left + right; export const account = combined;\n`;
      },
    ],
    [
      "expression-bodied map with an identifier parameter",
      () => {
        const value = fixtureValue("shared-skeleton-email");
        const [left, right] = splitValue(value);
        return `export const account = [${JSON.stringify(left)}, ${JSON.stringify(right)}].map((part) => part).join("");\n`;
      },
    ],
    [
      "nested-array map with a destructured parameter",
      () => {
        const value = fixtureValue("shared-skeleton-email");
        const [localPart, host] = value.split("@");
        const [domain, topLevelDomain] = host!.split(".");
        return `export const accounts = [[${JSON.stringify(localPart)}, ${JSON.stringify(domain)}, ${JSON.stringify(topLevelDomain)}]].map(([local, domain, tld]) => [local, [domain, tld].join(".")].join("@"));\n`;
      },
    ],
  ])("detects a synthetic marker represented through %s", (_label, source) => {
    const repositoryRoot = createRepository();
    const value = fixtureValue("shared-skeleton-email");
    const content = source();
    expect(content).not.toContain(value);
    writeRepositoryFile(repositoryRoot, "src/derived.ts", content);

    const report = scanFixtureBoundary({ repositoryRoot });

    expect(report.findings).toEqual([
      {
        markerClass: "shared-skeleton-email",
        relativePath: "src/derived.ts",
        surface: "repository-source",
      },
    ]);
    expect(JSON.stringify(report)).not.toContain(value);
  });

  it.each(["base64", "base64url"] as const)(
    "detects a fragmented synthetic %s representation",
    (encoding) => {
      const repositoryRoot = createRepository();
      const value = fixtureValue("shared-local-dev-password");
      const encoded = Buffer.from(value, "utf8").toString(encoding);
      const content = `export const encoded = ${joinedArrayExpression(encoded)};\n`;
      expect(content).not.toContain(value);
      expect(content).not.toContain(encoded);
      writeRepositoryFile(repositoryRoot, "src/encoded.ts", content);

      const report = scanFixtureBoundary({ repositoryRoot });

      expect(report.findings).toEqual([
        {
          markerClass: "shared-local-dev-password",
          relativePath: "src/encoded.ts",
          surface: "repository-source",
        },
      ]);
      expect(JSON.stringify(report)).not.toContain(value);
      expect(JSON.stringify(report)).not.toContain(encoded);
    },
  );

  it("detects an exact encoded representation in a non-script artifact", () => {
    const repositoryRoot = createRepository();
    const value = fixtureValue("shared-skeleton-password");
    const encoded = Buffer.from(value, "utf8").toString("base64url");
    writeRepositoryFile(repositoryRoot, "fixtures/credential.txt", encoded);

    const report = scanFixtureBoundary({ repositoryRoot });

    expect(report.findings).toEqual([
      {
        markerClass: "shared-skeleton-password",
        relativePath: "fixtures/credential.txt",
        surface: "repository-source",
      },
    ]);
    expect(JSON.stringify(report)).not.toContain(encoded);
  });

  it("detects a fragmented encoded marker in production JavaScript output", () => {
    const repositoryRoot = createRepository();
    writeRepositoryFile(
      repositoryRoot,
      "safe.ts",
      "export const safe = true;\n",
    );
    const buildOutputDirectory = path.join(repositoryRoot, ".next");
    writeCompleteBuildOutput(buildOutputDirectory);
    const value = fixtureValue("shared-local-dev-email");
    const encoded = Buffer.from(value, "utf8").toString("base64url");
    const content = `const parts = ${joinedArrayExpression(encoded)}; self.account = parts;\n`;
    expect(content).not.toContain(encoded);
    expect(content).not.toContain(value);
    writeFile(
      path.join(buildOutputDirectory, "static", "chunks", "account.js"),
      content,
    );

    const report = scanFixtureBoundary({
      buildOutputDirectory,
      repositoryRoot,
      requireBuildOutput: true,
    });

    expect(report.findings).toEqual([
      {
        markerClass: "shared-local-dev-email",
        relativePath: "static/chunks/account.js",
        surface: "next-production-output",
      },
    ]);
    expect(JSON.stringify(report)).not.toContain(encoded);
    expect(JSON.stringify(report)).not.toContain(value);
  });

  it("applies derived analysis to scanner-named paths without an allowlist", () => {
    const repositoryRoot = createRepository();
    const value = fixtureValue("shared-skeleton-password");
    const content = `export const forbidden = ${binaryConcatenation(value)};\n`;
    expect(content).not.toContain(value);
    writeRepositoryFile(
      repositoryRoot,
      "apps/web/scripts/check-walking-skeleton-boundary.test.ts",
      content,
    );

    const report = scanFixtureBoundary({ repositoryRoot });

    expect(report.findings).toEqual([
      {
        markerClass: "shared-skeleton-password",
        relativePath:
          "apps/web/scripts/check-walking-skeleton-boundary.test.ts",
        surface: "repository-source",
      },
    ]);
  });

  it("redacts synthetic forbidden representations embedded in a finding path", () => {
    const repositoryRoot = createRepository();
    const forbiddenValue = fixtureValue("shared-skeleton-email");
    const relativePath = `src/${forbiddenValue}.ts`;
    writeRepositoryFile(
      repositoryRoot,
      relativePath,
      `export const forbidden = ${JSON.stringify(forbiddenValue)};\n`,
    );

    const report = scanFixtureBoundary({ repositoryRoot });
    const serialized = JSON.stringify(report);

    expect(report.findings).toEqual([
      {
        markerClass: "shared-skeleton-email",
        relativePath: "src/[redacted].ts",
        surface: "repository-source",
      },
    ]);
    expect(serialized).not.toContain(forbiddenValue);
    expect(() => assertWalkingSkeletonBoundary(report)).toThrow(
      "shared-skeleton-email [repository-source] src/[redacted].ts",
    );
  });

  it("does not flag unrelated expressions or a contextual name outside a name initializer", () => {
    const repositoryRoot = createRepository();
    const contextualName = fixtureValue("shared-skeleton-account-name");
    const content = [
      `const title = ${joinedArrayExpression("healthy-fixture-journal")};`,
      `const encoded = ${joinedArrayExpression("not_base64***")};`,
      `const document = { title: ${binaryConcatenation(contextualName)} };`,
      `export const safe = [title, encoded, document];`,
    ].join("\n");
    expect(content).not.toContain(contextualName);
    writeRepositoryFile(repositoryRoot, "src/safe-derived.ts", content);

    expect(scanFixtureBoundary({ repositoryRoot }).findings).toEqual([]);
  });

  it("scans untracked source that could be committed", () => {
    const repositoryRoot = createRepository();
    writeRepositoryFile(
      repositoryRoot,
      "src/new-client.ts",
      fixtureValue("shared-skeleton-password"),
      false,
    );

    const report = scanFixtureBoundary({ repositoryRoot });

    expect(report.findings).toEqual([
      expect.objectContaining({
        markerClass: "shared-skeleton-password",
        relativePath: "src/new-client.ts",
        surface: "repository-source",
      }),
    ]);
  });

  it("falls back to a bounded filesystem inventory and excludes runtime env", () => {
    const repositoryRoot = createDirectory();
    const forbiddenValue = fixtureValue("shared-local-dev-email");
    writeFile(path.join(repositoryRoot, ".env.example"), forbiddenValue);
    writeFile(
      path.join(repositoryRoot, ".env.local"),
      fixtureValue("shared-skeleton-password"),
    );
    writeFile(
      path.join(repositoryRoot, ".env.production.local"),
      fixtureValue("shared-skeleton-password"),
    );
    for (const generatedDirectory of [
      ".runtime",
      ".vercel",
      "build",
      "node_modules",
      "out",
      "playwright-report",
      "storybook-static",
      "temp",
      "test-results",
      "tmp",
    ]) {
      writeFile(
        path.join(repositoryRoot, generatedDirectory, "ignored.js"),
        fixtureValue("shared-skeleton-password"),
      );
    }
    writeFile(
      path.join(repositoryRoot, "src", "safe.ts"),
      "export const safe = true;\n",
    );

    const report = scanFixtureBoundary({
      buildOutputDirectory: path.join(repositoryRoot, "missing-build-output"),
      repositoryRoot,
    });

    expect(report.repositoryFileCount).toBe(2);
    expect(report.findings).toEqual([
      {
        markerClass: "shared-local-dev-email",
        relativePath: ".env.example",
        surface: "repository-source",
      },
    ]);
    expect(JSON.stringify(report)).not.toContain(forbiddenValue);
  });

  it("checks deployable output while ignoring local dev and cache trees", () => {
    const repositoryRoot = createRepository();
    writeRepositoryFile(
      repositoryRoot,
      "safe.ts",
      "export const safe = true;\n",
    );
    const buildOutputDirectory = path.join(repositoryRoot, ".next");
    writeCompleteBuildOutput(buildOutputDirectory);
    writeFile(
      path.join(buildOutputDirectory, "server", "app", "chunk.js"),
      fixtureValue("shared-skeleton-password"),
    );
    writeFile(
      path.join(buildOutputDirectory, "dev", "server", "stale.js"),
      fixtureValue("shared-skeleton-email"),
    );
    writeFile(
      path.join(buildOutputDirectory, "cache", "compiler.bin"),
      fixtureValue("shared-skeleton-email"),
    );

    const report = scanFixtureBoundary({
      buildOutputDirectory,
      repositoryRoot,
      requireBuildOutput: true,
    });

    expect(report.buildFileCount).toBe(4);
    expect(report.findings).toEqual([
      {
        markerClass: "shared-skeleton-password",
        relativePath: "server/app/chunk.js",
        surface: "next-production-output",
      },
    ]);
  });

  it("fails closed when required postbuild output is missing", () => {
    const repositoryRoot = createRepository();
    writeRepositoryFile(
      repositoryRoot,
      "safe.ts",
      "export const safe = true;\n",
    );

    expect(() =>
      scanFixtureBoundary({
        buildOutputDirectory: path.join(repositoryRoot, ".next"),
        repositoryRoot,
        requireBuildOutput: true,
      }),
    ).toThrow("requires a completed Next production build");
  });

  it("fails closed when postbuild output is structurally incomplete", () => {
    const repositoryRoot = createRepository();
    writeRepositoryFile(
      repositoryRoot,
      "safe.ts",
      "export const safe = true;\n",
    );
    const buildOutputDirectory = path.join(repositoryRoot, ".next");
    writeFile(path.join(buildOutputDirectory, "BUILD_ID"), "build-id\n");
    writeFile(
      path.join(buildOutputDirectory, "server", "app-paths-manifest.json"),
      "{}\n",
    );

    expect(() =>
      scanFixtureBoundary({
        buildOutputDirectory,
        repositoryRoot,
        requireBuildOutput: true,
      }),
    ).toThrow("requires complete Next production build output");
  });

  it.each(
    SYNTHETIC_MARKERS.filter(
      (marker) =>
        !("matchContext" in marker) ||
        marker.matchContext !== "account-name-initializer",
    ),
  )("detects exact synthetic $markerClass bytes", (marker) => {
    const repositoryRoot = createRepository();
    writeRepositoryFile(repositoryRoot, "src/marker.txt", marker.value);

    const report = scanFixtureBoundary({ repositoryRoot });

    expect(report.findings).toEqual([
      expect.objectContaining({
        markerClass: marker.markerClass,
        surface: "repository-source",
      }),
    ]);
    expect(JSON.stringify(report)).not.toContain(marker.value);
  });

  it.each(["ts", "json"])(
    "detects a contextual account name initializer in %s",
    (extension) => {
      const repositoryRoot = createRepository();
      const value = fixtureValue("shared-skeleton-account-name");
      const content =
        extension === "json"
          ? JSON.stringify({ name: value })
          : `const identity = { name: ${binaryConcatenation(value)} };`;
      writeRepositoryFile(repositoryRoot, `src/identity.${extension}`, content);

      const report = scanFixtureBoundary({ repositoryRoot });

      expect(report.findings).toEqual([
        expect.objectContaining({
          markerClass: "shared-skeleton-account-name",
          surface: "repository-source",
        }),
      ]);
      expect(JSON.stringify(report)).not.toContain(value);
    },
  );

  it("does not treat a documentation title as an account initializer", () => {
    const repositoryRoot = createRepository();
    const value = fixtureValue("shared-skeleton-account-name");
    writeRepositoryFile(
      repositoryRoot,
      "README.md",
      `# ${value}\n\nThis is an internal diagnostic.\n`,
    );

    expect(scanFixtureBoundary({ repositoryRoot }).findings).toEqual([]);
  });

  it("detects removed structures in production manifests", () => {
    const repositoryRoot = createRepository();
    writeRepositoryFile(
      repositoryRoot,
      "safe.ts",
      "export const safe = true;\n",
    );
    const buildOutputDirectory = path.join(repositoryRoot, ".next");
    writeCompleteBuildOutput(buildOutputDirectory);
    const actionSymbol = fixtureValue("legacy-skeleton-server-action-symbol");
    const actionPath = fixtureValue("legacy-skeleton-server-action-path");
    writeFile(
      path.join(
        buildOutputDirectory,
        "server",
        "server-reference-manifest.json",
      ),
      JSON.stringify({ actionPath, actionSymbol }),
    );

    const report = scanFixtureBoundary({
      buildOutputDirectory,
      repositoryRoot,
      requireBuildOutput: true,
    });

    expect(report.findings).toEqual([
      expect.objectContaining({
        markerClass: "legacy-skeleton-server-action-symbol",
        surface: "next-production-output",
      }),
      expect.objectContaining({
        markerClass: "legacy-skeleton-server-action-path",
        surface: "next-production-output",
      }),
    ]);
    expect(JSON.stringify(report)).not.toContain(actionSymbol);
    expect(JSON.stringify(report)).not.toContain(actionPath);
  });
});

function scanFixtureBoundary(options: WalkingSkeletonBoundaryOptions) {
  return scanWalkingSkeletonBoundaryWithSyntheticMarkers(
    options,
    SYNTHETIC_MARKERS,
  );
}

function fixtureValue(
  markerClass: WalkingSkeletonBoundaryMarkerFixture["markerClass"],
) {
  const marker = SYNTHETIC_MARKERS.find(
    (candidate) => candidate.markerClass === markerClass,
  );
  if (!marker) throw new Error("Synthetic marker fixture is missing.");
  return marker.value;
}

function createRepository() {
  const repositoryRoot = createDirectory();
  execFileSync("git", ["init", "--quiet"], { cwd: repositoryRoot });
  return repositoryRoot;
}

function createDirectory() {
  const directory = mkdtempSync(
    path.join(tmpdir(), "overgarden-walking-skeleton-boundary-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

function writeRepositoryFile(
  repositoryRoot: string,
  relativePath: string,
  content: string,
  tracked = true,
) {
  writeFile(path.join(repositoryRoot, relativePath), content);
  if (tracked) {
    execFileSync("git", ["add", "--", relativePath], { cwd: repositoryRoot });
  }
}

function writeFile(filePath: string, content: string) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function writeCompleteBuildOutput(buildOutputDirectory: string) {
  writeFile(path.join(buildOutputDirectory, "BUILD_ID"), "build-id\n");
  writeFile(
    path.join(buildOutputDirectory, "server", "app-paths-manifest.json"),
    "{}\n",
  );
  writeFile(
    path.join(buildOutputDirectory, "static", "chunks", "runtime.js"),
    "self.__next_runtime = true;\n",
  );
}

function splitValue(value: string): [string, string] {
  const midpoint = Math.max(1, Math.floor(value.length / 2));
  return [value.slice(0, midpoint), value.slice(midpoint)];
}

function binaryConcatenation(value: string) {
  const [left, right] = splitValue(value);
  return `${JSON.stringify(left)} + ${JSON.stringify(right)}`;
}

function joinedArrayExpression(value: string) {
  const [left, right] = splitValue(value);
  return `[${JSON.stringify(left)}, ${JSON.stringify(right)}].join("")`;
}

function escapedStringLiteral(value: string) {
  const index = Math.max(1, Math.floor(value.length / 3));
  const escapedCharacter = value.codePointAt(index);
  if (escapedCharacter === undefined) throw new Error("Expected marker text.");
  const escaped = `${value.slice(0, index)}\\u${escapedCharacter
    .toString(16)
    .padStart(4, "0")}${value.slice(index + 1)}`;
  return JSON.stringify(escaped).replace("\\\\u", "\\u");
}
