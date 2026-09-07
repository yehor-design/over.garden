/**
 * The evidence guard the matching proofs share.
 *
 * It was born inside the OVE-163 deterministic-matching rollout proof, whose
 * matcher and job kinds OVE-399 retired. The guard is not about that matcher:
 * it is the rule that a proof published to Linear or a receipt carries counts
 * and never a person — no owner, no reviewer, no journal text, no coordinate,
 * no credential. That rule outlives every rollout, so it lives on its own.
 */

const FORBIDDEN_EVIDENCE_KEYS = new Set([
  "rawpayload",
  "payload",
  "sourcerecordid",
  "sourcerecordkey",
  "sourcesnapshotid",
  "sourceonlyfields",
  "owneruserid",
  "revieweruserid",
  "sessionid",
  "journalbody",
  "journaltitle",
  "quarantinekey",
  "derivativekey",
  "coordinates",
  "latitude",
  "longitude",
  "gps",
  "exif",
  "email",
  "ip",
  "ipaddress",
  "useragent",
  "referrer",
  "cookie",
  "token",
  "secret",
  "password",
  "databaseurl",
  "directurl",
  "certificate",
]);

const FORBIDDEN_EVIDENCE_VALUE_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /postgres(?:ql)?:\/\//i,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/i,
] as const;

export function assertNoForbiddenMatchingEvidence(output: unknown) {
  visitEvidence(output, "evidence");
}

function visitEvidence(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitEvidence(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
      if (FORBIDDEN_EVIDENCE_KEYS.has(normalizedKey)) {
        throw new Error(`Rollout evidence contains forbidden field at ${path}.`);
      }
      visitEvidence(nested, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === "string") {
    for (const pattern of FORBIDDEN_EVIDENCE_VALUE_PATTERNS) {
      if (pattern.test(value)) {
        throw new Error(`Rollout evidence contains a forbidden value at ${path}.`);
      }
    }
  }
}
