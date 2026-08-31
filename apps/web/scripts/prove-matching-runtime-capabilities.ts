import process from "node:process";

import {
  parseMatchingRuntimeCapabilityArgs,
  runMatchingRuntimeCapabilitySmokeFromHeartbeat,
  validateMatchingRuntimeCapabilityOptions,
} from "../src/lib/matching-runtime-proof";
import { readMatchingRuntimeHeartbeat } from "./matching-runtime-heartbeat-reader";

/**
 * OVE-190 matching runtime capability proof, sourced from the worker's own
 * heartbeat row rather than from a service that described itself.
 */
async function main() {
  const parsed = parseMatchingRuntimeCapabilityArgs(process.argv.slice(2));
  const options = validateMatchingRuntimeCapabilityOptions({
    expectedCommitSha:
      parsed.expectedCommitSha ??
      process.env.MATCHING_RUNTIME_EXPECTED_COMMIT_SHA,
    expectedImageDigest:
      parsed.expectedImageDigest ??
      process.env.MATCHING_RUNTIME_EXPECTED_IMAGE_DIGEST,
  });
  const evidence = await runMatchingRuntimeCapabilitySmokeFromHeartbeat(
    options,
    () => readMatchingRuntimeHeartbeat("available"),
  );
  console.log(JSON.stringify(evidence, null, 2));
}

main().catch((error: unknown) => {
  // The class, never the message: a database error can echo a connection string.
  console.error(
    error instanceof Error && /never_started|--base-url/u.test(error.message)
      ? error.message
      : "OVE-190 matching runtime capability proof failed.",
  );
  process.exitCode = 1;
});
