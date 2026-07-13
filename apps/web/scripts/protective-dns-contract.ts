export type ResolutionStatus = "pass" | "mismatch" | "error";

export interface ResolutionCheck {
  resolver: string;
  domain: string;
  expected: string[];
  observed: string[];
  status: ResolutionStatus;
  error?: string;
}

interface ResolutionAssessmentInput {
  resolver: string;
  domain: string;
  expected: string[];
  observed?: string[];
  error?: unknown;
}

export interface ResolutionSummary {
  status: ResolutionStatus;
  exitCode: 0 | 1 | 2;
  counts: Record<ResolutionStatus, number>;
}

function normalizeAddresses(addresses: string[]): string[] {
  return [...new Set(addresses.map((address) => address.toLowerCase()))].sort();
}

function addressSetsMatch(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((address, index) => address === right[index])
  );
}

export function assessResolution(
  input: ResolutionAssessmentInput,
): ResolutionCheck {
  const expected = normalizeAddresses(input.expected);
  const observed = normalizeAddresses(input.observed ?? []);

  if (input.error || expected.length === 0) {
    return {
      resolver: input.resolver,
      domain: input.domain,
      expected,
      observed,
      status: "error",
      error: "DNS query failed",
    };
  }

  return {
    resolver: input.resolver,
    domain: input.domain,
    expected,
    observed,
    status: addressSetsMatch(expected, observed) ? "pass" : "mismatch",
  };
}

export function summarizeResolutionChecks(
  checks: ResolutionCheck[],
): ResolutionSummary {
  const counts: Record<ResolutionStatus, number> = {
    pass: 0,
    mismatch: 0,
    error: 0,
  };

  for (const check of checks) {
    counts[check.status] += 1;
  }

  if (counts.error > 0 || checks.length === 0) {
    return { status: "error", exitCode: 1, counts };
  }

  if (counts.mismatch > 0) {
    return { status: "mismatch", exitCode: 2, counts };
  }

  return { status: "pass", exitCode: 0, counts };
}
