import { describe, expect, it } from "vitest";

import {
  EXACT_LEXICAL_DIRECT_PACKAGES,
  EXACT_LEXICAL_VERSION,
  findForbiddenLexicalActivations,
  findRetiredBundleReferences,
  inventoryRetiredEngineReferences,
  validateLexicalPackageContract,
} from "./verify-editorjs-retirement";

const exactDependencies = Object.fromEntries(
  EXACT_LEXICAL_DIRECT_PACKAGES.map((packageName) => [
    packageName,
    EXACT_LEXICAL_VERSION,
  ]),
);

const exactLockfile = [
  "  'lexical@0.49.0':",
  "  '@lexical/react@0.49.0':",
  "  '@lexical/extension@0.49.0':",
].join("\n");

describe("OVE-317 retirement verifier", () => {
  it("rejects an active retired runtime reference", () => {
    const inventory = inventoryRetiredEngineReferences([
      {
        relativePath: "apps/web/src/example.ts",
        content: 'import Legacy from "@editorjs/editorjs";',
      },
    ]);

    expect(inventory.activeReferences).toHaveLength(1);
  });

  it("classifies only exact historical paths and detects stale allowlist entries", () => {
    const inventory = inventoryRetiredEngineReferences([
      {
        relativePath: "docs/MVP_SCOPE_RECHECK_2026-07-03.md",
        content: "OVE-202 owns Editor.js in this dated decision.",
      },
    ]);

    expect(inventory.activeReferences).toHaveLength(0);
    expect(inventory.historicalReferences[0]?.classification).toBe(
      "dated MVP scope decision",
    );
    expect(inventory.staleHistoricalPaths.length).toBeGreaterThan(0);
  });

  it("requires the exact direct pins and one resolved Lexical version", () => {
    expect(
      validateLexicalPackageContract(exactDependencies, exactLockfile),
    ).toEqual([]);
    expect(
      validateLexicalPackageContract(
        { ...exactDependencies, lexical: "^0.49.0" },
        `${exactLockfile}\n  '@lexical/link@0.48.0':`,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("lexical must be pinned exactly"),
        expect.stringContaining("Resolved Lexical versions"),
      ]),
    );
  });

  it("rejects forbidden collaboration and experimental activation", () => {
    expect(
      findForbiddenLexicalActivations([
        {
          relativePath: "apps/web/src/editor.ts",
          content: 'import { x } from "@lexical/yjs";',
        },
      ]),
    ).toHaveLength(1);
  });

  it("rejects retired runtime markers in built chunks", () => {
    expect(
      findRetiredBundleReferences([
        { relativePath: "static/chunks/a.js", content: "LexicalEditor" },
        {
          relativePath: "static/chunks/b.js",
          content: "codex-editor runtime",
        },
      ]),
    ).toEqual(["static/chunks/b.js"]);
  });
});
