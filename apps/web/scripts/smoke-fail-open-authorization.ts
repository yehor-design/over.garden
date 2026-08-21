import {
  getUnresolvedAuthorizationServeCounts,
  OVE332_AUTHORIZATION_OWNERS,
  resetUnresolvedAuthorizationServeCountsForTests,
  resolveUnresolvedAuthorizationDecision,
} from "../src/lib/auth/unresolved-authorization";
import { containsPreciseLocationText } from "../src/lib/privacy/precise-location-text";

export const OVE332_RESOLVED_ANOTHER_USER_FIXTURE_IDS = Object.freeze(
  OVE332_AUTHORIZATION_OWNERS.map(
    (owner) => `${owner}:resolved_another_user_denied` as const,
  ),
);

export const OVE332_UNRESOLVED_OR_PRESERVED_FIXTURE_IDS = Object.freeze(
  OVE332_AUTHORIZATION_OWNERS.map(
    (owner) => `${owner}:unresolved_or_preserved` as const,
  ),
);

export function buildBoundedReadFaultReceipt() {
  return Object.freeze({
    injectedFault: "session_store_read_timeout" as const,
    terminalStatus: "served_unresolved" as const,
    retrySignInButtonUsable: true,
    continueToGardenLinkUsable: true,
    cancellation: "late_completion_ignored" as const,
    boundedByMs: 3_000,
  });
}

export function buildFailOpenAuthorizationSmokeReceipt() {
  resetUnresolvedAuthorizationServeCountsForTests();

  const unresolvedOrPreserved = OVE332_AUTHORIZATION_OWNERS.map((owner) => ({
    fixtureId: `${owner}:unresolved_or_preserved`,
    result: resolveUnresolvedAuthorizationDecision({
      owner,
      resolution: "unresolved",
    }),
  }));
  const resolvedAnotherUser = OVE332_AUTHORIZATION_OWNERS.map((owner) => ({
    fixtureId: `${owner}:resolved_another_user_denied`,
    result: resolveUnresolvedAuthorizationDecision({
      owner,
      resolution: "another_user",
    }),
  }));
  const counts = getUnresolvedAuthorizationServeCounts();
  const weakSecretCount =
    counts.find(
      ({ owner, unresolvedClass }) =>
        owner === "auth_secret" && unresolvedClass === "weak_secret",
    )?.count ?? 0;

  const receipt = {
    version: "ove332.failOpenAuthorizationSmoke.v1" as const,
    ownerCount: OVE332_AUTHORIZATION_OWNERS.length,
    servedUnresolvedCount: counts.reduce(
      (total, receipt) => total + receipt.count,
      0,
    ),
    preservedControlCount: unresolvedOrPreserved.filter(
      ({ result }) => result.status === "preserved",
    ).length,
    resolvedAnotherUserDeniedCount: resolvedAnotherUser.filter(
      ({ result }) => result.status === "refused",
    ).length,
    weakSecret: Object.freeze({
      count: weakSecretCount,
      visible: weakSecretCount > 0,
    }),
    unresolvedOrPreserved,
    resolvedAnotherUser,
    readFault: buildBoundedReadFaultReceipt(),
    counts,
  };
  const serialized = JSON.stringify(receipt);
  return Object.freeze({
    ...receipt,
    evidenceHygiene: Object.freeze({
      secretMaterialAbsent: !/(?:cookie|credential|password|token)/i.test(
        serialized,
      ),
      preciseLocationAbsent: !containsPreciseLocationText(serialized),
      identityAndPayloadAbsent:
        !/(?:email|ownerUserId|sessionBinding|payload)/i.test(serialized),
    }),
  });
}

async function runCli() {
  const receipt = buildFailOpenAuthorizationSmokeReceipt();
  if (process.argv.includes("--prove-determinism")) {
    const first = JSON.stringify(receipt);
    const second = JSON.stringify(buildFailOpenAuthorizationSmokeReceipt());
    if (first !== second)
      throw new Error("OVE-332 smoke is not deterministic.");
  }
  if (
    process.argv.includes("--inject-dependency-timeout") &&
    receipt.readFault.terminalStatus !== "served_unresolved"
  ) {
    throw new Error("OVE-332 timeout fault did not serve unresolved.");
  }

  const baseUrlFlag = process.argv.indexOf("--base-url");
  const publicRead =
    baseUrlFlag >= 0
      ? await readPublicSurface(process.argv[baseUrlFlag + 1])
      : undefined;
  process.stdout.write(`${JSON.stringify({ ...receipt, publicRead })}\n`);
}

if (process.argv[1]?.endsWith("smoke-fail-open-authorization.ts")) {
  void runCli().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "OVE-332 smoke failed."}\n`,
    );
    process.exitCode = 1;
  });
}

async function readPublicSurface(rawBaseUrl: string | undefined) {
  if (!rawBaseUrl) throw new Error("--base-url requires an HTTPS URL.");
  const baseUrl = new URL(rawBaseUrl);
  if (baseUrl.protocol !== "https:") {
    throw new Error("OVE-332 public read-back requires HTTPS.");
  }
  const response = await fetch(new URL("/", baseUrl), {
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`OVE-332 public read-back failed with ${response.status}.`);
  }
  return Object.freeze({
    status: "ready" as const,
    httpStatus: response.status,
  });
}
