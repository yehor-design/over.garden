import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const bootstrapSource = readFileSync(
  path.join(process.cwd(), "scripts/bootstrap-admin-owner.ts"),
  "utf8",
);

describe("sealed owner bootstrap proof contract", () => {
  it("checks verified credential evidence before mutating role rows", () => {
    const verificationIndex = bootstrapSource.indexOf(
      "const ownerAccountEvidence = buildVerifiedOwnerAccountEvidence",
    );
    const transactionIndex = bootstrapSource.indexOf(
      "await db.transaction().execute",
    );

    expect(bootstrapSource).toContain('.select("emailVerified")');
    expect(bootstrapSource).toContain('.select(["providerId", "password"])');
    expect(verificationIndex).toBeGreaterThan(-1);
    expect(transactionIndex).toBeGreaterThan(verificationIndex);
  });

  it("emits truthful redacted evidence instead of a fabricated user flag", () => {
    const outputStart = bootstrapSource.indexOf("console.log(");
    const outputEnd = bootstrapSource.indexOf("  } finally", outputStart);
    const outputBlock = bootstrapSource.slice(outputStart, outputEnd);

    expect(bootstrapSource).toContain("...ownerAccountEvidence");
    expect(bootstrapSource).toContain("redactOwnerBootstrapFailure()");
    expect(bootstrapSource).not.toContain("userVerified");
    expect(outputStart).toBeGreaterThan(-1);
    expect(outputEnd).toBeGreaterThan(outputStart);
    expect(outputBlock).not.toContain("userId");
  });
});
