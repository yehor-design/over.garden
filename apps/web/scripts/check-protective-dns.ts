import { Resolver, resolve4 as resolve4WithSystemDns } from "node:dns/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assessResolution,
  summarizeResolutionChecks,
  type ResolutionCheck,
} from "./protective-dns-contract";

export const PROTECTIVE_DNS_DOMAINS = [
  "over.garden",
  "www.over.garden",
] as const;
const BASELINE_DNS = "1.1.1.1";
const QUERY_TIMEOUT_MS = 8_000;

interface ResolverConfig {
  label: string;
  server?: string;
}

const PROTECTIVE_DNS_RESOLVERS: readonly ResolverConfig[] = [
  { label: "system-default" },
  { label: "cloudflare", server: "1.1.1.1" },
  { label: "cloudflare-security", server: "1.1.1.2" },
  { label: "google", server: "8.8.8.8" },
  { label: "quad9", server: "9.9.9.9" },
  { label: "cisco-umbrella", server: "208.67.222.222" },
  { label: "cisco-umbrella-secondary", server: "208.67.220.220" },
] as const;

export function getProtectiveDnsResolutionPlan(): Array<{
  resolver: string;
  domain: (typeof PROTECTIVE_DNS_DOMAINS)[number];
}> {
  return PROTECTIVE_DNS_RESOLVERS.flatMap((resolver) =>
    PROTECTIVE_DNS_DOMAINS.map((domain) => ({
      resolver: resolver.label,
      domain,
    })),
  );
}

function createResolver(servers: string[]): Resolver {
  const resolver = new Resolver({ timeout: 3_000, tries: 2 });
  resolver.setServers(servers);
  return resolver;
}

async function withTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("DNS query timed out")),
          QUERY_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function resolveAuthoritativeAddresses(): Promise<
  Map<(typeof PROTECTIVE_DNS_DOMAINS)[number], string[]>
> {
  const baselineResolver = createResolver([BASELINE_DNS]);
  const nameservers = await withTimeout(
    baselineResolver.resolveNs("over.garden"),
  );
  const nameserverAddresses = (
    await Promise.all(
      nameservers.map((nameserver) =>
        withTimeout(baselineResolver.resolve4(nameserver)),
      ),
    )
  ).flat();

  if (nameserverAddresses.length === 0) {
    throw new Error("Authoritative nameservers did not resolve");
  }

  const authoritativeResolver = createResolver(nameserverAddresses);
  const records = await Promise.all(
    PROTECTIVE_DNS_DOMAINS.map(
      async (domain) =>
        [
          domain,
          await withTimeout(authoritativeResolver.resolve4(domain)),
        ] as const,
    ),
  );

  return new Map(records);
}

async function queryResolver(
  resolver: ResolverConfig,
  domain: (typeof PROTECTIVE_DNS_DOMAINS)[number],
  expected: string[],
): Promise<ResolutionCheck> {
  try {
    const observed = resolver.server
      ? await withTimeout(createResolver([resolver.server]).resolve4(domain))
      : await withTimeout(resolve4WithSystemDns(domain));

    return assessResolution({
      resolver: resolver.label,
      domain,
      expected,
      observed,
    });
  } catch (error) {
    return assessResolution({
      resolver: resolver.label,
      domain,
      expected,
      error,
    });
  }
}

function printHumanReadable(
  expectedByDomain: Map<(typeof PROTECTIVE_DNS_DOMAINS)[number], string[]>,
  checks: ResolutionCheck[],
): void {
  console.log("Protective DNS reputation check");
  console.log(`Checked: ${new Date().toISOString()}`);

  for (const domain of PROTECTIVE_DNS_DOMAINS) {
    console.log(
      `Authoritative ${domain}: ${(expectedByDomain.get(domain) ?? []).join(", ")}`,
    );
  }

  for (const check of checks) {
    const observed =
      check.observed.length > 0 ? check.observed.join(", ") : "query failed";
    console.log(
      `${check.status.toUpperCase()} ${check.resolver} ${check.domain}: ${observed}`,
    );
  }
}

export async function main(): Promise<number> {
  try {
    const expectedByDomain = await resolveAuthoritativeAddresses();
    const checks = await Promise.all(
      PROTECTIVE_DNS_RESOLVERS.flatMap((resolver) =>
        PROTECTIVE_DNS_DOMAINS.map((domain) =>
          queryResolver(resolver, domain, expectedByDomain.get(domain) ?? []),
        ),
      ),
    );
    const summary = summarizeResolutionChecks(checks);

    if (process.argv.includes("--json")) {
      console.log(
        JSON.stringify(
          {
            checkedAt: new Date().toISOString(),
            authoritative: Object.fromEntries(expectedByDomain),
            checks,
            summary,
          },
          null,
          2,
        ),
      );
    } else {
      printHumanReadable(expectedByDomain, checks);
      console.log(
        `Summary: ${summary.status} (${summary.counts.pass} pass, ${summary.counts.mismatch} mismatch, ${summary.counts.error} error)`,
      );
    }

    return summary.exitCode;
  } catch {
    console.error("Protective DNS check failed before comparisons completed.");
    return 1;
  }
}

const isDirectRun =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectRun) {
  void main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
