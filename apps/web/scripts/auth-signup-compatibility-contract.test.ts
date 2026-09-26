import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const scriptsDirectory = path.join(process.cwd(), "scripts");
const emailSignupScripts = readdirSync(scriptsDirectory)
  .filter(
    (filename) => filename.endsWith(".ts") && !filename.endsWith(".test.ts"),
  )
  .map((filename) => ({
    filename,
    source: readFileSync(path.join(scriptsDirectory, filename), "utf8"),
  }))
  .filter(({ source }) => source.includes("/api/auth/sign-up/email"));

describe("auth smoke signup compatibility contract", () => {
  it("covers every direct email-signup smoke client", () => {
    expect(emailSignupScripts.length).toBeGreaterThan(0);
  });

  for (const { filename, source } of emailSignupScripts) {
    it(`supplies the private compatibility value in ${filename}`, () => {
      expect(source).toContain(
        'import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";',
      );
      expect(source).toContain("name: PRIVATE_AUTH_COMPATIBILITY_NAME");
    });

    // ADR-0038 D2: `/sign-up/email` refuses a body without the ticked box.
    it(`ticks the terms box in ${filename}`, () => {
      expect(source).toContain("legalAccepted: true");
    });
  }
});
