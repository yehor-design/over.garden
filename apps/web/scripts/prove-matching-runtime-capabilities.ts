import process from "node:process";

import {
  parseMatchingRuntimeCapabilityArgs,
  runMatchingRuntimeCapabilitySmoke,
  validateMatchingRuntimeCapabilityOptions,
} from "../src/lib/matching-runtime-proof";

async function main() {
  const parsed = parseMatchingRuntimeCapabilityArgs(process.argv.slice(2));
  const options = validateMatchingRuntimeCapabilityOptions({
    baseUrl: parsed.baseUrl ?? process.env.MATCHING_RUNTIME_BASE_URL,
    expectedCommitSha:
      parsed.expectedCommitSha ??
      process.env.MATCHING_RUNTIME_EXPECTED_COMMIT_SHA,
    expectedImageDigest:
      parsed.expectedImageDigest ??
      process.env.MATCHING_RUNTIME_EXPECTED_IMAGE_DIGEST,
  });
  const evidence = await runMatchingRuntimeCapabilitySmoke(options);
  console.log(JSON.stringify(evidence, null, 2));
}

main().catch(() => {
  console.error("OVE-190 matching runtime capability smoke failed.");
  process.exitCode = 1;
});
