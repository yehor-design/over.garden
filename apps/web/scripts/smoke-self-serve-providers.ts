/**
 * OVE-193 production provider surface smoke (redacted).
 * Proves enabled providers expose start URLs, Facebook stays hidden unless
 * FACEBOOK_LOGIN_PUBLIC_READY is set, and guest auth copy is not invite-gated.
 * Never prints secrets, emails, tokens, or object paths.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(import.meta.url));
const pkg = require(path.join(root, "..", "package.json")) as {
  scripts?: Record<string, string>;
};

const EVIDENCE_SAFETY =
  "bounded_booleans_and_classes_no_secrets_or_identifiers";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readFlagValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function configured(value: string | undefined) {
  const trimmed = value?.trim();
  return Boolean(trimmed && trimmed.length > 0 && !trimmed.includes("REPLACE"));
}

function facebookPublicReady(env: NodeJS.ProcessEnv) {
  const value = env.FACEBOOK_LOGIN_PUBLIC_READY?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function resolveFacebookSurface(env: NodeJS.ProcessEnv) {
  const clientIdConfigured = configured(env.FACEBOOK_CLIENT_ID);
  const clientSecretConfigured = configured(env.FACEBOOK_CLIENT_SECRET);
  const publicLaunchReady = facebookPublicReady(env);
  const configuredBoth = clientIdConfigured && clientSecretConfigured;
  return {
    configured: configuredBoth,
    publicLaunchReady,
    providerEnabled: false,
  };
}

async function main() {
  const environment = readFlagValue("--environment");
  const confirm = readFlagValue("--confirm-environment");
  const expectedCommit = readFlagValue("--expected-commit");
  assert(
    environment === "production" && confirm === "production",
    "Requires --environment production --confirm-environment production",
  );
  assert(
    typeof expectedCommit === "string" &&
      /^[0-9a-f]{40}$/i.test(expectedCommit),
    "Requires --expected-commit <40-char sha>",
  );
  assert(
    pkg.scripts?.["smoke:self-serve-providers"]?.includes(
      "smoke-self-serve-providers.ts",
    ),
    "package.json must expose smoke:self-serve-providers",
  );

  loadEnv({ path: ".env.production.local", override: false });
  loadEnv({ path: ".env.local", override: false });

  const baseUrl = "https://over.garden";
  // Local env cannot authoritatively know production FACEBOOK_LOGIN_PUBLIC_READY.
  // Treat the live control as the source of truth and report local env class separately.
  const localFacebookState = resolveFacebookSurface({
    ...process.env,
    VERCEL_ENV: "production",
  });

  const gardenResponse = await fetch(new URL("/garden", baseUrl), {
    redirect: "manual",
  });
  const gardenStatusClass =
    gardenResponse.status === 200
      ? "200"
      : gardenResponse.status >= 300 && gardenResponse.status < 400
        ? "3xx"
        : "other";
  const gardenHtml =
    gardenResponse.status === 200 ? await gardenResponse.text() : "";

  const authHelp = await fetch(new URL("/auth/help", baseUrl));
  assert(authHelp.ok, "auth help must be reachable");
  const authHelpHtml = await authHelp.text();
  assert(
    !/доступний лише за запрошеннями|само с покани|только по приглашениям/i.test(
      authHelpHtml,
    ),
    "auth help must not claim invite-only public MVP",
  );

  const googleStart = await fetch(new URL("/api/auth/sign-in/social", baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: baseUrl,
    },
    body: JSON.stringify({
      provider: "google",
      callbackURL: "/garden",
    }),
    redirect: "manual",
  });
  const googleStartClass =
    googleStart.status >= 200 && googleStart.status < 400
      ? "2xx_or_3xx"
      : "failed";
  const googleBody = await googleStart.text();
  const googleLocation = googleStart.headers.get("location") ?? "";
  const googleHasAuthUrl =
    /accounts\.google\.com|google\.com\/o\/oauth/i.test(googleBody) ||
    /accounts\.google\.com|google\.com\/o\/oauth/i.test(googleLocation);
  assert(googleHasAuthUrl, "Google social start must expose an authorization URL");

  const intentPage = await fetch(new URL("/auth/intent", baseUrl));
  assert(intentPage.ok, "auth intent page must be reachable");
  const intentHtml = await intentPage.text();
  const intentFacebookVisible = intentHtml.includes(
    'data-testid="facebook-sign-in-button"',
  );
  const gardenFacebookVisible =
    gardenHtml.includes('data-testid="facebook-sign-in-button"') ||
    /facebook-sign-in-button/i.test(gardenHtml) ||
    /facebookSignInEnabled.:true/.test(gardenHtml);

  assert(
    !intentFacebookVisible && !gardenFacebookVisible,
    "Hard-disabled Facebook must be absent from every guest surface",
  );
  const facebookStart = await fetch(
    new URL("/api/auth/sign-in/social", baseUrl),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: baseUrl,
      },
      body: JSON.stringify({
        provider: "facebook",
        callbackURL: "/garden",
      }),
      redirect: "manual",
    },
  );
  const facebookStartClass =
    facebookStart.status >= 200 && facebookStart.status < 400
      ? "2xx_or_3xx"
      : "rejected";
  const facebookBody = await facebookStart.text();
  const facebookLocation = facebookStart.headers.get("location") ?? "";
  const facebookAuthorizationUrlPresent =
    /facebook\.com|fb\.com/i.test(facebookBody) ||
    /facebook\.com|fb\.com/i.test(facebookLocation);
  assert(
    !facebookAuthorizationUrlPresent,
    "Hard-disabled Facebook must not expose a Meta authorization URL",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        issue: "OVE-193",
        evidenceClass: "production_provider_surface",
        expectedCommitSha: expectedCommit,
        gardenGuestStatusClass: gardenStatusClass,
        googleSocialStartClass: googleStartClass,
        googleAuthorizationUrlPresent: googleHasAuthUrl,
        facebook: {
          localEnvConfigured: localFacebookState.configured,
          localEnvPublicLaunchReady: localFacebookState.publicLaunchReady,
          liveButtonVisibleOnIntent: intentFacebookVisible,
          liveButtonVisibleOnGardenGuestShell: gardenFacebookVisible,
          socialStartClass: facebookStartClass,
          authorizationUrlPresent: facebookAuthorizationUrlPresent,
          fallbackWhenHidden: "email_and_google",
        },
        authHelpInviteOnlyClaimAbsent: true,
        evidenceSafety: EVIDENCE_SAFETY,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      ok: false,
      issue: "OVE-193",
      error: "self_serve_providers_smoke_failed",
      evidenceSafety: EVIDENCE_SAFETY,
      message: error instanceof Error ? error.message : "unknown",
    }),
  );
  process.exitCode = 1;
});
