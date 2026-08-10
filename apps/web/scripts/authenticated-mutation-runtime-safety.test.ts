import { describe, expect, it } from "vitest";

import {
  analyzeAuthenticatedMutationRuntimeImports,
  scanAuthenticatedMutationNextBuildSentinels,
  type AuthenticatedMutationNextBuildInventory,
} from "./authenticated-mutation-runtime-safety";

describe("authenticated mutation runtime import safety", () => {
  it("reports a direct runtime import of a forbidden dormant module", () => {
    const report = analyzeAuthenticatedMutationRuntimeImports({
      files: [
        {
          path: "src/app/page.tsx",
          sourceText:
            'import { dormant } from "@/lib/auth/dormant"; export default function Page() { return dormant; }',
        },
        {
          path: "src/lib/auth/dormant.ts",
          sourceText: "export const dormant = null;",
        },
      ],
      runtimeRoots: ["src/app/page.tsx"],
      forbiddenPaths: ["src/lib/auth/dormant.ts"],
    });

    expect(report).toEqual({
      state: "unsafe",
      findings: [
        {
          forbiddenPath: "src/lib/auth/dormant.ts",
          importChain: ["src/app/page.tsx", "src/lib/auth/dormant.ts"],
          runtimeRoot: "src/app/page.tsx",
        },
      ],
      unsupported: [],
    });
  });

  it("traverses a relative re-export before reaching a forbidden module", () => {
    const report = analyzeAuthenticatedMutationRuntimeImports({
      files: [
        {
          path: "src/app/page.tsx",
          sourceText: 'import { dormant } from "../runtime-bridge";',
        },
        {
          path: "src/runtime-bridge.ts",
          sourceText: 'export { dormant } from "./lib/auth/dormant";',
        },
        {
          path: "src/lib/auth/dormant.ts",
          sourceText: "export const dormant = null;",
        },
      ],
      runtimeRoots: ["src/app/page.tsx"],
      forbiddenPaths: ["src/lib/auth/dormant.ts"],
    });

    expect(report.findings).toEqual([
      {
        forbiddenPath: "src/lib/auth/dormant.ts",
        importChain: [
          "src/app/page.tsx",
          "src/runtime-bridge.ts",
          "src/lib/auth/dormant.ts",
        ],
        runtimeRoot: "src/app/page.tsx",
      },
    ]);
    expect(report.state).toBe("unsafe");
  });

  it("traverses a literal dynamic import", () => {
    const report = analyzeAuthenticatedMutationRuntimeImports({
      files: [
        {
          path: "src/app/page.tsx",
          sourceText:
            'export async function loadDormant() { return import("../lib/auth/dormant"); }',
        },
        {
          path: "src/lib/auth/dormant.ts",
          sourceText: "export const dormant = null;",
        },
      ],
      runtimeRoots: ["src/app/page.tsx"],
      forbiddenPaths: ["src/lib/auth/dormant.ts"],
    });

    expect(report).toMatchObject({
      state: "unsafe",
      findings: [
        {
          importChain: ["src/app/page.tsx", "src/lib/auth/dormant.ts"],
        },
      ],
    });
  });

  it("traverses a literal CommonJS require", () => {
    const report = analyzeAuthenticatedMutationRuntimeImports({
      files: [
        {
          path: "src/app/route.js",
          sourceText: 'const dormant = require("../lib/auth/dormant");',
        },
        {
          path: "src/lib/auth/dormant.js",
          sourceText: "module.exports = {};",
        },
      ],
      runtimeRoots: ["src/app/route.js"],
      forbiddenPaths: ["src/lib/auth/dormant.js"],
    });

    expect(report.findings[0]?.importChain).toEqual([
      "src/app/route.js",
      "src/lib/auth/dormant.js",
    ]);
    expect(report.state).toBe("unsafe");
  });

  it("ignores type-only imports and re-exports", () => {
    const report = analyzeAuthenticatedMutationRuntimeImports({
      files: [
        {
          path: "src/app/page.tsx",
          sourceText: [
            'import type { Dormant } from "@/lib/auth/dormant";',
            'export type { Dormant } from "@/lib/auth/dormant";',
            "export default function Page(): Dormant | null { return null; }",
          ].join("\n"),
        },
        {
          path: "src/lib/auth/dormant.ts",
          sourceText: "export interface Dormant { readonly marker: string }",
        },
      ],
      runtimeRoots: ["src/app/page.tsx"],
      forbiddenPaths: ["src/lib/auth/dormant.ts"],
    });

    expect(report).toEqual({
      state: "safe",
      findings: [],
      unsupported: [],
    });
  });

  it("fails closed on reachable nonliteral dynamic import and require calls", () => {
    const report = analyzeAuthenticatedMutationRuntimeImports({
      files: [
        {
          path: "src/app/page.tsx",
          sourceText: [
            'const moduleName = "../lib/auth/dormant";',
            "void import(moduleName);",
            "void require(moduleName);",
          ].join("\n"),
        },
        {
          path: "src/lib/auth/dormant.ts",
          sourceText: "export const dormant = null;",
        },
      ],
      runtimeRoots: ["src/app/page.tsx"],
      forbiddenPaths: ["src/lib/auth/dormant.ts"],
    });

    expect(report).toEqual({
      state: "unsupported",
      findings: [],
      unsupported: [
        {
          path: "src/app/page.tsx",
          reason: "nonliteral_dynamic_import",
        },
        {
          path: "src/app/page.tsx",
          reason: "nonliteral_require",
        },
      ],
    });
  });
});

describe("authenticated mutation Next build sentinel safety", () => {
  it("finds an exact dormant marker in a server chunk", async () => {
    const report = await scanAuthenticatedMutationNextBuildSentinels({
      inventory: buildInventory({
        BUILD_ID: "feature-build\n",
        "server/app-paths-manifest.json": "{}\n",
        "server/app/page.js":
          'const marker = "overgarden.document-mutation.owner.v1";\n',
        "static/chunks/runtime.js": "self.__next_runtime = true;\n",
      }),
      sentinels: [
        {
          id: "document-mutation-owner-domain",
          value: "overgarden.document-mutation.owner.v1",
        },
      ],
    });

    expect(report).toEqual({
      state: "unsafe",
      scannedArtifactCount: 2,
      findings: [
        {
          artifactPath: "server/app/page.js",
          representation: "exact",
          sentinelId: "document-mutation-owner-domain",
        },
      ],
      errors: [],
    });
  });

  it("finds base64 and base64url dormant markers in static chunks", async () => {
    const report = await scanAuthenticatedMutationNextBuildSentinels({
      inventory: buildInventory({
        BUILD_ID: "feature-build\n",
        "server/app-paths-manifest.json": "{}\n",
        "server/app/page.js": "export default function Page() {}\n",
        "static/chunks/a.js":
          'const encoded = "b3ZlcmdhcmRlbi5kb2N1bWVudC1tdXRhdGlvbi5vd25lci52MQ==";\n',
        "static/chunks/b.js":
          'const encoded = "b3ZlcmdhcmRlbi5kb2N1bWVudC1tdXRhdGlvbi5vd25lci52MQ";\n',
      }),
      sentinels: [
        {
          id: "document-mutation-owner-domain",
          value: "overgarden.document-mutation.owner.v1",
        },
      ],
    });

    expect(report.findings).toEqual([
      {
        artifactPath: "static/chunks/a.js",
        representation: "base64",
        sentinelId: "document-mutation-owner-domain",
      },
      {
        artifactPath: "static/chunks/b.js",
        representation: "base64url",
        sentinelId: "document-mutation-owner-domain",
      },
    ]);
    expect(report.state).toBe("unsafe");
  });

  it("finds a dormant marker fragmented across a static expression", async () => {
    const report = await scanAuthenticatedMutationNextBuildSentinels({
      inventory: buildInventory({
        BUILD_ID: "feature-build\n",
        "server/app-paths-manifest.json": "{}\n",
        "server/app/page.js":
          'const marker = "overgarden.document-" + "mutation.owner.v1";\n',
        "static/chunks/runtime.js": "self.__next_runtime = true;\n",
      }),
      sentinels: [
        {
          id: "document-mutation-owner-domain",
          value: "overgarden.document-mutation.owner.v1",
        },
      ],
    });

    expect(report.findings).toEqual([
      {
        artifactPath: "server/app/page.js",
        representation: "static_expression",
        sentinelId: "document-mutation-owner-domain",
      },
    ]);
    expect(report.state).toBe("unsafe");
  });

  it.each([
    {
      label: "BUILD_ID",
      files: {
        "server/app-paths-manifest.json": "{}\n",
        "static/chunks/runtime.js": "self.__next_runtime = true;\n",
      },
      errorCode: "missing_build_id",
    },
    {
      label: "non-empty BUILD_ID",
      files: {
        BUILD_ID: " \n",
        "server/app-paths-manifest.json": "{}\n",
        "static/chunks/runtime.js": "self.__next_runtime = true;\n",
      },
      errorCode: "empty_build_id",
    },
    {
      label: "app paths manifest",
      files: {
        BUILD_ID: "feature-build\n",
        "static/chunks/runtime.js": "self.__next_runtime = true;\n",
      },
      errorCode: "missing_app_paths_manifest",
    },
    {
      label: "valid app paths manifest",
      files: {
        BUILD_ID: "feature-build\n",
        "server/app-paths-manifest.json": "[]\n",
        "static/chunks/runtime.js": "self.__next_runtime = true;\n",
      },
      errorCode: "invalid_app_paths_manifest",
    },
    {
      label: "static runtime chunk",
      files: {
        BUILD_ID: "feature-build\n",
        "server/app-paths-manifest.json": "{}\n",
        "server/app/page.js": "export default function Page() {}\n",
      },
      errorCode: "missing_static_runtime_chunk",
    },
  ])("fails closed without a complete $label", async ({ files, errorCode }) => {
    const report = await scanAuthenticatedMutationNextBuildSentinels({
      inventory: buildInventory(files),
      sentinels: [
        {
          id: "document-mutation-owner-domain",
          value: "overgarden.document-mutation.owner.v1",
        },
      ],
    });

    expect(report.state).toBe("inconclusive");
    expect(report.errors).toEqual([{ code: errorCode }]);
  });
});

function buildInventory(
  files: Readonly<Record<string, string | undefined>>,
): AuthenticatedMutationNextBuildInventory {
  return {
    async listFiles() {
      return Object.keys(files).reverse();
    },
    async readFile(relativePath) {
      const value = files[relativePath];
      if (value === undefined)
        throw new Error(`Missing fixture ${relativePath}`);
      return Buffer.from(value, "utf8");
    },
  };
}
