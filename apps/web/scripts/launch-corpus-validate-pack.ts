import process from "node:process";

import { validateLaunchCorpusContentPackFile } from "../src/server/launch-corpus/content-pack-file";

const argv = process.argv.slice(2);

async function main() {
  const environment = requireMatchingEnvironment(argv);
  const packFile = requireFlag(argv, "--pack-file");
  const { validation } = await validateLaunchCorpusContentPackFile(packFile);
  const errors = validation.errors;
  const receipt = {
    ok: errors.length === 0,
    issue: "OVE-199",
    environment,
    mode: "validate_frozen_v1_pack",
    historicalEvidenceOnly: true,
    mutationAuthority: false,
    redacted: true,
    contentPackDigest:
      errors.length === 0 ? validation.contentPackDigest : null,
    slotCount: validation.slotCount,
    mediaCount: validation.mediaCount,
    publicSlotCount: validation.publicSlotCount,
    privateSlotCount: validation.privateSlotCount,
    archivedSlotCount: validation.archivedSlotCount,
    errorCodes: errors,
  };
  console.log(JSON.stringify(receipt));
  if (!receipt.ok) process.exitCode = 2;
}

function requireMatchingEnvironment(args: string[]) {
  const environment = requireFlag(args, "--environment");
  const confirm = requireFlag(args, "--confirm-environment");
  if (environment !== confirm) {
    throw new Error("Environment confirmation mismatch.");
  }
  if (environment !== "local" && environment !== "production") {
    throw new Error("Environment must be local or production.");
  }
  return environment;
}

function requireFlag(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : null;
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      ok: false,
      issue: "OVE-199",
      redacted: true,
      errorCode:
        error instanceof SyntaxError ? "invalid_json" : "validation_failed",
    }),
  );
  process.exitCode = 1;
});
