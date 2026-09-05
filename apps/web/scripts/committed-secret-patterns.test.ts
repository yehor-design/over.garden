import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Every tracked file, scanned for credential shapes that have no business in
 * a public repository.
 *
 * Written after the 2026-09-05 audit of the Google OAuth client: the
 * downloaded `client_secret_*.json` had been kept in the research corpus that
 * is mirrored into `docs/product-research/`, and stayed out of git only
 * because nobody copied it across. This test makes that "nobody" a rule, and
 * `.gitignore` refuses the file name outright. On failure it names the file
 * and the pattern, never the matched value.
 */
const PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  {
    name: "Google OAuth client secret",
    pattern: /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/,
  },
  { name: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  {
    // The header alone appears in tests as a forbidden marker; a key has a
    // body after it.
    name: "private key block",
    pattern:
      /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----\s*\n[A-Za-z0-9+/=\s]{40,}/,
  },
  {
    name: "GitHub token",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/,
  },
  { name: "AWS access key id", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "DigitalOcean API token", pattern: /\bdop_v1_[a-f0-9]{64}\b/ },
  {
    name: "DigitalOcean managed database password",
    pattern: /\bAVNS_[A-Za-z0-9_-]{12,}\b/,
  },
  { name: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  {
    name: "Resend API key",
    pattern: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{20,}\b/,
  },
];

/** Larger files are lockfiles and generated types, not places a secret hides. */
const MAX_BYTES = 2_000_000;

function repositoryRoot() {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
}

function trackedFiles(root: string) {
  return execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
}

describe("committed secret patterns", () => {
  it("finds no credential-shaped value in any tracked file", () => {
    const root = repositoryRoot();
    const self = path.relative(root, fileURLToPath(import.meta.url));
    const findings: string[] = [];

    for (const file of trackedFiles(root)) {
      if (file === self) continue;
      const absolute = path.join(root, file);
      let size: number;
      try {
        size = statSync(absolute).size;
      } catch {
        continue; // tracked but not on disk in this checkout
      }
      if (size > MAX_BYTES) continue;
      const bytes = readFileSync(absolute);
      if (bytes.subarray(0, 8_000).includes(0)) continue; // binary
      const text = bytes.toString("utf8");
      for (const { name, pattern } of PATTERNS) {
        if (pattern.test(text)) findings.push(`${file}: ${name}`);
      }
    }

    expect(findings).toEqual([]);
  });
});
