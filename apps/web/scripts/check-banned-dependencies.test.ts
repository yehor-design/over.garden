import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  runBannedDependencyGate,
  scanPackageJson,
  scanSource,
} from "./check-banned-dependencies";

const roots: string[] = [];

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "overgarden-banned-"));
  roots.push(root);
  mkdirSync(join(root, "src", "lib"), { recursive: true });
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("banned-dependency gate", () => {
  it("refuses banned packages by exact name and by prefix", () => {
    expect(
      scanPackageJson({
        dependencies: { dexie: "^4", next: "16" },
        devDependencies: { "workbox-window": "^7" },
      }).map((violation) => violation.detail),
    ).toEqual(["dexie", "workbox-window"]);
    expect(scanPackageJson({ dependencies: { kysely: "^0.29" } })).toEqual([]);
  });

  it("names the browser APIs that would bring back offline or speech input", () => {
    expect(scanSource("const r = new window.SpeechRecognition();")).toEqual([
      "speech_recognition",
    ]);
    expect(scanSource("await navigator.serviceWorker.register('/sw.js')")).toEqual([
      "service_worker_register",
    ]);
    expect(scanSource("const db = indexedDB.open('x')")).toEqual(["indexeddb"]);
    expect(scanSource("import sharp from \"sharp\";")).toEqual(["sharp_import"]);
    expect(scanSource("const online = navigator.onLine;")).toEqual(["navigator_online"]);
    expect(scanSource("fetch('/api/garden/entries')")).toEqual([]);
  });

  it("fails on a source hit outside the residue allowlist and passes on a clean tree", () => {
    const root = fixtureRoot();
    writeFileSync(join(root, "src", "lib", "clean.ts"), "export const ok = 1;\n");
    expect(
      runBannedDependencyGate({ rootDir: root, packageJson: {}, allowedResidue: [] })
        .violations,
    ).toEqual([]);

    writeFileSync(
      join(root, "src", "lib", "speech.ts"),
      "export const R = window.webkitSpeechRecognition;\n",
    );
    const report = runBannedDependencyGate({ rootDir: root, packageJson: {}, allowedResidue: [] });
    expect(report.violations).toEqual([
      { kind: "source", detail: "src/lib/speech.ts: speech_recognition" },
    ]);
  });

  it("excuses pending residue while it exists and fails once the allowlist goes stale", () => {
    const root = fixtureRoot();
    writeFileSync(
      join(root, "src", "lib", "speech.ts"),
      "export const R = window.SpeechRecognition;\n",
    );
    const residue = [{ pathPrefix: "src/lib/speech.ts", owner: "OVE-364" }];
    const excused = runBannedDependencyGate({ rootDir: root, packageJson: {}, allowedResidue: residue });
    expect(excused.violations).toEqual([]);
    expect(excused.excusedFiles).toBe(1);

    writeFileSync(join(root, "src", "lib", "speech.ts"), "export const clean = true;\n");
    const cleaned = runBannedDependencyGate({ rootDir: root, packageJson: {}, allowedResidue: residue });
    expect(cleaned.violations.map((violation) => violation.kind)).toEqual(["stale_allowlist"]);

    rmSync(join(root, "src", "lib", "speech.ts"));
    const stale = runBannedDependencyGate({ rootDir: root, packageJson: {}, allowedResidue: residue });
    expect(stale.violations.map((violation) => violation.kind)).toEqual(["stale_allowlist"]);
  });

  it("ignores test files and type declarations", () => {
    const root = fixtureRoot();
    writeFileSync(join(root, "src", "lib", "a.test.ts"), "indexedDB;\n");
    writeFileSync(join(root, "src", "lib", "types.d.ts"), "declare var indexedDB: unknown;\n");
    expect(
      runBannedDependencyGate({ rootDir: root, packageJson: {}, allowedResidue: [] }).violations,
    ).toEqual([]);
  });
});
