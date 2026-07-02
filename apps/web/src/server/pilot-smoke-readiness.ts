import "server-only";

import { resolveDatabaseConnection } from "@/db/connection";
import { isBlockedBetterAuthSecret } from "@/lib/auth-secret";
import {
  FACEBOOK_CLIENT_ID_ENV,
  FACEBOOK_CLIENT_SECRET_ENV,
  FACEBOOK_OAUTH_LOCAL_REDIRECT_URI,
  FACEBOOK_OAUTH_PRODUCTION_REDIRECT_URI,
  facebookOAuthConfigurationState,
} from "@/lib/auth/facebook-oauth";
import {
  GOOGLE_CLIENT_ID_ENV,
  GOOGLE_CLIENT_SECRET_ENV,
  GOOGLE_OAUTH_LOCAL_REDIRECT_URI,
  GOOGLE_OAUTH_PRODUCTION_REDIRECT_URI,
  googleOAuthConfigurationState,
} from "@/lib/auth/google-oauth";
import { vercelUrl } from "@/lib/runtime-url";
import { pingDatabase } from "@/server/health-repository";

const PILOT_INVITE_SIGNING_SECRET_ENV = "PILOT_INVITE_SIGNING_SECRET";
const CANONICAL_PRODUCTION_ORIGIN = "https://over.garden";

type EnvLike = Record<string, string | undefined>;

export type PilotSmokeSeverity = "pass" | "warn" | "fail" | "manual";

export interface PilotSmokeCheck {
  id: string;
  label: string;
  severity: PilotSmokeSeverity;
  summary: string;
  evidence: string;
}

export interface PilotSmokeSection {
  id: string;
  title: string;
  checks: PilotSmokeCheck[];
}

export interface PilotSmokeReadiness {
  generatedAt: Date;
  overall: "ready" | "degraded" | "blocked";
  sections: PilotSmokeSection[];
  redactionRules: string[];
  smokeSteps: string[];
  references: { label: string; path: string }[];
}

export interface PilotSmokeDatabaseProbe {
  reachable: boolean;
  error?: string;
}

export async function getPilotSmokeReadinessSafely(
  env: EnvLike = process.env,
): Promise<PilotSmokeReadiness> {
  const databaseProbe = await probeDatabaseSafely();

  return buildPilotSmokeReadiness({
    env,
    databaseProbe,
    generatedAt: new Date(),
  });
}

export function buildPilotSmokeReadiness({
  env,
  databaseProbe,
  generatedAt,
}: {
  env: EnvLike;
  databaseProbe: PilotSmokeDatabaseProbe;
  generatedAt: Date;
}): PilotSmokeReadiness {
  const sections: PilotSmokeSection[] = [
    {
      id: "deployment",
      title: "Deployment and public access",
      checks: [
        checkConfiguredHttpsUrl(
          env,
          "PUBLIC_SITE_URL",
          "Public site URL",
          "The founder and crawlers need a canonical HTTPS public URL for pilot smoke.",
          publicSmokeOrigin(env),
        ),
        checkConfiguredHttpsUrl(
          env,
          "BETTER_AUTH_URL",
          "Better Auth URL",
          "Auth callbacks and cookies must point at the same deployed origin used in the smoke.",
          authSmokeOrigin(env),
        ),
        checkVercelRuntime(env),
        {
          id: "deployment-public-access",
          label: "Unauthenticated public access",
          severity: "manual",
          summary:
            "Run the documented smoke against the deployed URL and confirm public pages return OverGarden HTML, not Vercel SSO.",
          evidence:
            "Use browser or curl evidence only: status code, redirect target class, cache headers, and page route. Do not store cookies or tokens.",
        },
        {
          id: "cloudflare-html-cache",
          label: "Cloudflare HTML cache",
          severity: "manual",
          summary:
            "Cloudflare may proxy DNS, but app HTML must not be cached at Cloudflare.",
          evidence:
            "Check response headers for public HTML routes. Any Cloudflare HTML HIT is a launch blocker.",
        },
      ],
    },
    {
      id: "auth-data-media",
      title: "Auth, data, and media path",
      checks: [
        checkDatabase(env, databaseProbe),
        checkBetterAuthSecret(env),
        checkGoogleOAuthConfiguration(env),
        checkFacebookOAuthConfiguration(env),
        checkPilotInviteSigningSecret(env),
        checkAdminRoleAccessModel(),
        checkR2Configuration(env),
        checkRequiredSecretPresence(
          env,
          "R2_ACCESS_KEY_ID",
          "R2 access key id",
        ),
        checkRequiredSecretPresence(
          env,
          "R2_SECRET_ACCESS_KEY",
          "R2 secret access key",
        ),
        {
          id: "media-derivative-readback",
          label: "Derivative-only media readback",
          severity: "manual",
          summary:
            "The smoke user must upload one photo, process it server-side, and read back only the stripped public derivative.",
          evidence:
            "Evidence may name the public derivative host, but must not include quarantine keys, signed upload URLs, EXIF, or original object keys.",
        },
      ],
    },
    {
      id: "public-surfaces",
      title: "Public SSR, deletion, and activation",
      checks: [
        {
          id: "public-entry-ssr",
          label: "Public journal SSR",
          severity: "manual",
          summary:
            "After first publication, `/journal/[slug]` must return server-rendered OverGarden HTML with `noindex` and no precise location.",
          evidence:
            "Store only status, route class, robots value, and whether derivative media is present. Do not store journal text.",
        },
        {
          id: "archive-410",
          label: "Archive to 410",
          severity: "manual",
          summary:
            "After archive, the old public journal URL must return HTTP 410 Gone and stay noindex.",
          evidence: "Record status code and robots value only.",
        },
        {
          id: "public-variety-activation",
          label: "Public variety activation",
          severity: "manual",
          summary:
            "A public variety CTA must carry only the safe slug into `/garden` and save through the canonical create/readback path.",
          evidence:
            "Record source as enum class only: public-variety/homepage/direct. Do not record raw URLs, referrers, or query strings.",
        },
        {
          id: "invited-cohort-loop",
          label: "Invited-cohort invite loop",
          severity: "manual",
          summary:
            "`/join` must be noindex and absent from the sitemap; its action carries only `source=invited-cohort` into `/garden`, the source survives auth into a first-entry save, and `/garden/pilot-health` shows the invited-cohort loop as aggregate counts.",
          evidence:
            "Record robots value, enum source class (invited_cohort), and aggregate starts/saves/follow-ups/returning counts only. Never record invite recipients, links, tokens, names, or emails.",
        },
      ],
    },
    {
      id: "search-worker-health",
      title: "Search and worker health",
      checks: [
        checkRequiredUrlPresence(
          env,
          "MEILISEARCH_HOST",
          "Meilisearch host",
          "Catalog typeahead and public-safe derived indexes need a configured Meilisearch host.",
          { degradedWhenMissing: true },
        ),
        checkRequiredSecretPresence(
          env,
          "MEILISEARCH_API_KEY",
          "Meilisearch API key",
          { degradedWhenMissing: true },
        ),
        checkRequiredUrlPresence(
          env,
          "MATCHING_SERVICE_URL",
          "Matching service URL",
          "The Python health service should be reachable by operators, even though product writes do not block on it.",
          { degradedWhenMissing: true },
        ),
        checkRequiredSecretPresence(
          env,
          "MATCHING_SERVICE_TOKEN",
          "Matching service token",
          { degradedWhenMissing: true },
        ),
        {
          id: "journal-search-worker",
          label: "Journal search worker jobs",
          severity: "manual",
          summary:
            "The Python worker handles journal_entry_index and journal_entry_unindex; OVE-36 live proof is recorded and must be repeated after worker, env, or search changes.",
          evidence:
            "Record only job processed/deleted state, derived index presence/absence, document field keys, and privacy booleans. Do not copy indexed document content, journal text, or Meilisearch keys.",
        },
      ],
    },
    {
      id: "durability-recovery",
      title: "Backup and worker recovery",
      checks: [
        {
          id: "database-backup-pitr",
          label: "Managed Postgres backup and PITR",
          severity: "manual",
          summary:
            "DigitalOcean managed Postgres backup/PITR for the production cluster is UNVERIFIED-NEEDS-OPERATOR (2026-06-29): this readout has no provider credentials, so an operator must confirm daily backups and a point-in-time window before inviting pilot users. Treat unconfirmed backups as a launch blocker.",
          evidence:
            "Verify in the DigitalOcean dashboard (Databases -> cluster -> Backups/Settings) or via `doctl databases backups list <cluster-id>`. Record only the cluster name class, backup-enabled boolean, retention/PITR window, and check date. Never copy database URLs, the CA body, credentials, or doctl tokens into evidence. See docs/INFRASTRUCTURE_REGISTRY.md.",
        },
        {
          id: "worker-process-manager",
          label: "Worker/Meili process manager",
          severity: "manual",
          summary:
            "The production Linux worker/Meilisearch droplet currently runs Docker Compose as its process manager; Apple Container is not the droplet runtime. Keep this boundary unless a separate Linux replacement live-proves restart policy, health, and journal index/unindex recovery.",
          evidence:
            "Confirm `restart:` policy and container health on the production droplet (e.g. `docker compose ps`, restart-policy inspect, matching `/health`, and Meili `/health`). Record only process-manager class, container status classes, and health booleans. Do not copy worker env files, Meilisearch keys, database URLs, or local runtime assumptions.",
        },
        {
          id: "worker-restart-recovery",
          label: "Worker restart/recovery smoke",
          severity: "manual",
          summary:
            "After restarting the matching-worker, a publish/archive search job must still reach done and keep the public-safe document contract. The deterministic local recovery harness (services/matching/tests/test_worker_recovery.py) proves stale-job reclaim, journal index/unindex to done, the public-safe contract, and idempotent re-delivery.",
          evidence:
            "For the live droplet smoke, record only job state transitions, document presence/absence, document field keys, and privacy booleans. Do not copy journal text, Meilisearch keys, or job payload identifiers tied to a user.",
        },
      ],
    },
  ];

  const allChecks = sections.flatMap((section) => section.checks);
  const overall = allChecks.some((check) => check.severity === "fail")
    ? "blocked"
    : allChecks.some((check) => check.severity === "warn")
      ? "degraded"
      : "ready";

  return {
    generatedAt,
    overall,
    sections,
    redactionRules: [
      "Do not capture raw journal title/body text in smoke evidence.",
      "Do not capture email addresses, signed cookies, tokens, API keys, database URLs, or Vercel SSO URLs with nonce values.",
      "Do not capture quarantine keys, signed upload URLs, original object keys, EXIF, IP addresses, user agents, referrers, or raw query strings.",
      "Do not capture precise location. Evidence may say hidden or region only.",
    ],
    smokeSteps: [
      "Open the deployed public URL and confirm `/`, `/health`, `/garden`, and `/privacy` return OverGarden HTML rather than deployment-provider auth.",
      "Start Google OAuth from `/garden`, confirm the provider accepts the exact callback without `redirect_uri_mismatch` or `INVALID_ORIGIN`, and confirm the callback lands back on `/garden` without recording auth params.",
      "Start Facebook Login from `/garden`, confirm Meta accepts the exact callback without redirect/origin errors, and confirm the callback lands back on `/garden` without recording auth params.",
      "Sign up or sign in as the pilot smoke user and create one first plant entry through `/garden`.",
      "For an existing gardener email/password account, sign in once, link Google from `/garden`, sign out, return with Google, and confirm the same garden data and invite grant stay attached to the same OverGarden user id.",
      "For an existing gardener email/password account, sign in once, link Facebook from `/garden`, sign out, return with Facebook, and confirm the same garden data and invite grant stay attached to the same OverGarden user id.",
      "Attach one photo, process it, and confirm authenticated readback shows only a public derivative URL.",
      "Add a follow-up entry to the same object and confirm it does not create a duplicate object.",
      "Publish the first entry after accepting the disclosure and confirm `/journal/[slug]` is SSR, noindex, location-safe, and derivative-only.",
      "Open the linked `/variety/[slug]`, use the CTA back into `/garden`, and save a second first-entry path with public-variety activation attribution.",
      "Open the noindex `/join` invite, confirm it is absent from the sitemap, follow it into `/garden?source=invited-cohort`, save a first entry plus a same-object follow-up, and confirm `/garden/pilot-health` shows the invited-cohort loop as aggregate counts.",
      "Archive the published entry and confirm the old public URL returns 410 Gone.",
      "Open `/garden/pilot-health` and confirm aggregate H1/H4/H6 counts update without raw private data.",
      "Open `/admin` as a normal Google- or Facebook-created or linked user and confirm access denied; then open it as the dedicated email/password owner account and confirm durable admin_user_roles access is available.",
      "Verify catalog typeahead or matching service health, then prove journal_entry_index and journal_entry_unindex job processing with redacted job_queue and Meilisearch evidence.",
      "Confirm durability before inviting users: managed Postgres backup/PITR status and a worker restart/recovery smoke that keeps the public-safe search contract. Record both with redacted evidence.",
    ],
    references: [
      {
        label: "SDD roadmap",
        path: "docs/SDD_VERTICAL_SLICE_ROADMAP.md",
      },
      {
        label: "Production pilot smoke",
        path: "docs/PRODUCTION_PILOT_SMOKE.md",
      },
      {
        label: "Infrastructure registry",
        path: "docs/INFRASTRUCTURE_REGISTRY.md",
      },
      {
        label: "SEO/content H6 research",
        path: "docs/product-research/B5_SEO_CONTENT_ARCHITECTURE_v2.md",
      },
      {
        label: "AI crawler and WAF synthesis",
        path: "docs/product-research/AI_SEO_SYNTHESIS_v0.md",
      },
      {
        label: "Privacy and deletion controls",
        path: "docs/product-research/CROSS_USER_TRUST_AND_PRIVACY_SPEC_v0.md",
      },
    ],
  };
}

async function probeDatabaseSafely(): Promise<PilotSmokeDatabaseProbe> {
  try {
    return { reachable: await pingDatabase() };
  } catch (error) {
    return {
      reachable: false,
      error: error instanceof Error ? error.message : "database probe failed",
    };
  }
}

function checkDatabase(
  env: EnvLike,
  probe: PilotSmokeDatabaseProbe,
): PilotSmokeCheck {
  const runtimeDatabase = resolveDatabaseConnection(env);
  const directUrl =
    env.DIRECT_URL ?? env.POSTGRES_URL_NON_POOLING ?? env.POSTGRES_URL;

  if (!runtimeDatabase.connectionString) {
    return {
      id: "database-config",
      label: "Postgres runtime and direct URLs",
      severity: "fail",
      summary:
        "A supported Postgres runtime connection must be configured for deployed smoke.",
      evidence:
        "Accepted runtime sources: DATABASE_URL, POSTGRES_URL, POSTGRES_PRISMA_URL, or POSTGRES_HOST/USER/PASSWORD/DATABASE. Never copy database URLs into evidence.",
    };
  }

  if (isLocalUrl(runtimeDatabase.connectionString)) {
    return {
      id: "database-config",
      label: "Postgres runtime and direct URLs",
      severity: "fail",
      summary:
        "The deployed smoke cannot use localhost Postgres; production or preview needs the managed database connection.",
      evidence: "Report only that a localhost placeholder was detected.",
    };
  }

  if (!probe.reachable) {
    return {
      id: "database-config",
      label: "Postgres runtime and direct URLs",
      severity: "fail",
      summary:
        "Database configuration exists, but the server-side probe failed.",
      evidence: probe.error
        ? `Record the error class only: ${redactError(probe.error)}`
        : "Record that the database probe returned false.",
    };
  }

  return {
    id: "database-config",
    label: "Postgres runtime and direct URLs",
    severity: isConfigured(directUrl) ? "pass" : "warn",
    summary: isConfigured(directUrl)
      ? "Database config is present and the server-side probe reached Postgres."
      : "Runtime database config is present and reachable; direct migration URL is not configured.",
    evidence:
      "Evidence may say database ping passed. Do not include connection strings.",
  };
}

function checkVercelRuntime(env: EnvLike): PilotSmokeCheck {
  if (env.VERCEL !== "1") {
    return {
      id: "vercel-runtime",
      label: "Vercel runtime",
      severity: "warn",
      summary:
        "This readout is not running inside Vercel, so deployment metadata must be verified externally.",
      evidence:
        "Local readiness can prepare the smoke, but cannot close the production proof.",
    };
  }

  return {
    id: "vercel-runtime",
    label: "Vercel runtime",
    severity: "pass",
    summary: `Running on Vercel ${safePublicValue(env.VERCEL_ENV) || "environment"}.`,
    evidence:
      "Use deployment id/commit metadata from Vercel. Do not include auth headers or protected share tokens.",
  };
}

function checkR2Configuration(env: EnvLike): PilotSmokeCheck {
  const endpoint = env.R2_ENDPOINT;
  const quarantineBucket = env.R2_QUARANTINE_BUCKET;
  const publicBucket = env.R2_PUBLIC_BUCKET;
  const publicBaseUrl = env.R2_PUBLIC_BASE_URL;

  if (
    !isConfigured(endpoint) ||
    !isConfigured(quarantineBucket) ||
    !isConfigured(publicBucket) ||
    !isConfigured(publicBaseUrl)
  ) {
    return {
      id: "r2-config",
      label: "Cloudflare R2 buckets and public base URL",
      severity: "fail",
      summary:
        "R2 endpoint, quarantine bucket, public bucket, and public base URL must be configured.",
      evidence:
        "Report configured/missing state only. Bucket names are non-secret; keys and signed URLs are not.",
    };
  }

  if (quarantineBucket === publicBucket) {
    return {
      id: "r2-config",
      label: "Cloudflare R2 buckets and public base URL",
      severity: "fail",
      summary:
        "Quarantine and public derivative buckets must be separate privacy boundaries.",
      evidence: "Report the boundary failure without object keys.",
    };
  }

  if (!isHttpsUrl(publicBaseUrl) && !isLocalUrl(publicBaseUrl)) {
    return {
      id: "r2-config",
      label: "Cloudflare R2 buckets and public base URL",
      severity: "fail",
      summary:
        "The public derivative base URL must be HTTPS in production or localhost in local development.",
      evidence: "Report the URL class only.",
    };
  }

  return {
    id: "r2-config",
    label: "Cloudflare R2 buckets and public base URL",
    severity:
      isLocalUrl(endpoint) || isLocalUrl(publicBaseUrl) ? "warn" : "pass",
    summary:
      isLocalUrl(endpoint) || isLocalUrl(publicBaseUrl)
        ? "R2 is using a local emulator URL; deployed smoke still needs production R2 env."
        : "R2 quarantine/public derivative boundary is configured.",
    evidence:
      "Evidence may mention the public derivative host only. Never include quarantine keys or signed upload URLs.",
  };
}

function checkAdminRoleAccessModel(): PilotSmokeCheck {
  return {
    id: "admin-role-access-model",
    label: "Admin role access model",
    severity: "manual",
    summary:
      "Internal operator surfaces use durable admin_user_roles capabilities; bootstrap owner access through the documented role script for a credential-only email/password account before smoke.",
    evidence:
      "Evidence may say owner/admin role present only. Do not copy user IDs, emails, cookies, tokens, connection strings, or env values.",
  };
}

function checkConfiguredHttpsUrl(
  env: EnvLike,
  name: string,
  label: string,
  evidence: string,
  effectiveValue = env[name],
): PilotSmokeCheck {
  const value = env[name];

  if (!isConfigured(value) && !isConfigured(effectiveValue)) {
    return {
      id: envId(name),
      label,
      severity: "fail",
      summary: `${name} is missing or still uses a placeholder.`,
      evidence,
    };
  }

  if (isProductionVercel(env) && !isConfigured(value)) {
    return {
      id: envId(name),
      label,
      severity: "fail",
      summary: `${name} must be explicitly configured as ${CANONICAL_PRODUCTION_ORIGIN} in the Vercel production environment.`,
      evidence:
        "Record only whether the explicit production env var is present and canonical. Do not copy cookies, auth callback URLs, or signed links.",
    };
  }

  if (isLocalUrl(effectiveValue)) {
    return {
      id: envId(name),
      label,
      severity: "warn",
      summary: `${name} points at localhost; this is valid locally but cannot close deployed smoke.`,
      evidence,
    };
  }

  if (!isHttpsUrl(effectiveValue)) {
    return {
      id: envId(name),
      label,
      severity: "fail",
      summary: `${name} must use HTTPS for production or preview smoke.`,
      evidence,
    };
  }

  if (
    isProductionVercel(env) &&
    originOf(effectiveValue) !== CANONICAL_PRODUCTION_ORIGIN
  ) {
    return {
      id: envId(name),
      label,
      severity: "fail",
      summary: `${name} must use ${CANONICAL_PRODUCTION_ORIGIN} in the Vercel production environment.`,
      evidence:
        "Record only the origin class and deployment environment. Do not copy cookies, auth callback URLs, or signed links.",
    };
  }

  return {
    id: envId(name),
    label,
    severity: "pass",
    summary: `${name} is configured as an HTTPS origin.`,
    evidence,
  };
}

function checkRequiredUrlPresence(
  env: EnvLike,
  name: string,
  label: string,
  evidence: string,
  options: { degradedWhenMissing?: boolean } = {},
): PilotSmokeCheck {
  const value = env[name];

  if (!isConfigured(value)) {
    return {
      id: envId(name),
      label,
      severity: options.degradedWhenMissing ? "warn" : "fail",
      summary: `${name} is missing or still uses a placeholder.`,
      evidence,
    };
  }

  return {
    id: envId(name),
    label,
    severity: isLocalUrl(value) ? "warn" : "pass",
    summary: isLocalUrl(value)
      ? `${name} points at a local service; deployed smoke needs the production service.`
      : `${name} is configured.`,
    evidence,
  };
}

function checkPilotInviteSigningSecret(env: EnvLike): PilotSmokeCheck {
  const secret = env[PILOT_INVITE_SIGNING_SECRET_ENV];
  const deployed = isHttpsUrl(publicSmokeOrigin(env));

  if (!isConfigured(secret)) {
    return {
      id: "pilot-invite-signing-secret",
      label: "Pilot invite signing secret",
      severity: deployed ? "fail" : "warn",
      summary: `${PILOT_INVITE_SIGNING_SECRET_ENV} is missing; invite links would use the insecure dev fallback.`,
      evidence:
        "Set a strong secret in Vercel before sharing production invite links. Generate URLs with `pnpm pilot:invite` from apps/web. Never commit secrets or printed links.",
    };
  }

  return {
    id: "pilot-invite-signing-secret",
    label: "Pilot invite signing secret",
    severity: "pass",
    summary: `${PILOT_INVITE_SIGNING_SECRET_ENV} is configured.`,
    evidence:
      "Founder generates invite URLs with `pnpm pilot:invite`. Evidence may say present only; never copy the secret or printed links.",
  };
}

function checkRequiredSecretPresence(
  env: EnvLike,
  name: string,
  label: string,
  options: { degradedWhenMissing?: boolean } = {},
): PilotSmokeCheck {
  const value = env[name];

  if (!isConfigured(value)) {
    return {
      id: envId(name),
      label,
      severity: options.degradedWhenMissing ? "warn" : "fail",
      summary: `${name} is missing or still uses a placeholder.`,
      evidence:
        "Evidence may say missing/present only. Never copy this value into docs, Linear, logs, or chat.",
    };
  }

  return {
    id: envId(name),
    label,
    severity: "pass",
    summary: `${name} is present.`,
    evidence:
      "Evidence may say present only. Never copy this value into docs, Linear, logs, or chat.",
  };
}

function checkBetterAuthSecret(env: EnvLike): PilotSmokeCheck {
  const value = env.BETTER_AUTH_SECRET;

  if (isBlockedBetterAuthSecret(value)) {
    return {
      id: "better-auth-secret",
      label: "Better Auth secret",
      severity: "fail",
      summary:
        "BETTER_AUTH_SECRET is missing, placeholder-like, or uses a local development fallback.",
      evidence:
        "Evidence may say missing, placeholder-like, or local fallback only. Never copy this value into docs, Linear, logs, or chat.",
    };
  }

  return checkRequiredSecretPresence(
    env,
    "BETTER_AUTH_SECRET",
    "Better Auth secret",
  );
}

function checkGoogleOAuthConfiguration(env: EnvLike): PilotSmokeCheck {
  const state = googleOAuthConfigurationState(env);

  if (!state.configured) {
    return {
      id: "google-oauth-provider",
      label: "Google OAuth provider",
      severity: isProductionVercel(env) ? "fail" : "warn",
      summary: `${GOOGLE_CLIENT_ID_ENV} and ${GOOGLE_CLIENT_SECRET_ENV} must both be present before Google sign-in can close smoke.`,
      evidence:
        "Evidence may say present or missing only. Never copy client secrets, OAuth tokens, callback params, cookies, or provider token responses.",
    };
  }

  return {
    id: "google-oauth-provider",
    label: "Google OAuth provider",
    severity: "manual",
    summary:
      "Google OAuth env is present; provider console must authorize the exact local and production callback URIs, and a real browser smoke must prove no redirect mismatch.",
    evidence: `Authorized redirect URIs must include ${GOOGLE_OAUTH_LOCAL_REDIRECT_URI} and ${GOOGLE_OAUTH_PRODUCTION_REDIRECT_URI}. Record only URI presence, origin class, and success/failure class.`,
  };
}

function checkFacebookOAuthConfiguration(env: EnvLike): PilotSmokeCheck {
  const state = facebookOAuthConfigurationState(env);

  if (!state.configured) {
    return {
      id: "facebook-oauth-provider",
      label: "Facebook Login provider",
      severity: isProductionVercel(env) ? "fail" : "warn",
      summary: `${FACEBOOK_CLIENT_ID_ENV} and ${FACEBOOK_CLIENT_SECRET_ENV} must both be present before Facebook sign-in can close smoke.`,
      evidence:
        "Evidence may say present or missing only. Never copy app secrets, OAuth tokens, callback params, cookies, or provider token responses.",
    };
  }

  return {
    id: "facebook-oauth-provider",
    label: "Facebook Login provider",
    severity: "manual",
    summary:
      "Facebook Login env is present; the Meta app must authorize the exact local and production callback URIs, use only basic login permissions, and a real browser smoke must prove no redirect mismatch.",
    evidence: `Valid OAuth Redirect URIs must include ${FACEBOOK_OAUTH_LOCAL_REDIRECT_URI} and ${FACEBOOK_OAUTH_PRODUCTION_REDIRECT_URI}. Record only URI presence, app mode class, origin class, and success/failure class.`,
  };
}

function isConfigured(value: string | undefined): value is string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === '""' || trimmed === "''") return false;
  const normalized = trimmed.toLowerCase();
  return !normalized.includes("change_me") && !normalized.includes("...");
}

function publicSmokeOrigin(env: EnvLike) {
  return env.PUBLIC_SITE_URL ?? env.NEXT_PUBLIC_SITE_URL ?? vercelUrl(env);
}

function authSmokeOrigin(env: EnvLike) {
  return (
    env.BETTER_AUTH_URL ??
    env.PUBLIC_SITE_URL ??
    env.NEXT_PUBLIC_SITE_URL ??
    vercelUrl(env)
  );
}

function isHttpsUrl(value: string | undefined) {
  return value?.startsWith("https://") ?? false;
}

function isLocalUrl(value: string | undefined) {
  if (!value) return false;
  return (
    value.includes("localhost") ||
    value.includes("127.0.0.1") ||
    value.includes("0.0.0.0")
  );
}

function isProductionVercel(env: EnvLike) {
  return env.VERCEL === "1" && env.VERCEL_ENV === "production";
}

function originOf(value: string | undefined) {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function envId(name: string) {
  return name.toLowerCase().replaceAll("_", "-");
}

function safePublicValue(value: string | undefined) {
  if (!value) return "";
  return value.replace(/[^a-z0-9_-]/gi, "");
}

function redactError(value: string) {
  return value
    .replaceAll(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted-database-url]")
    .replaceAll(/https?:\/\/[^\s]+/gi, "[redacted-url]")
    .slice(0, 180);
}
