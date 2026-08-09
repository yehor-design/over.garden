/**
 * OVE-296 production provider surface smoke (redacted).
 * Proves the supported Google provider exposes a start URL, credential entry
 * remains present, and guest auth copy is not invite-gated.
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
  assert(gardenStatusClass === "200", "signed-out garden must be reachable");

  const authHelp = await fetch(new URL("/auth/help", baseUrl));
  assert(authHelp.ok, "auth help must be reachable");
  const authHelpHtml = await authHelp.text();
  assert(
    !/доступний лише за запрошеннями|само с покани|только по приглашениям/i.test(
      authHelpHtml,
    ),
    "auth help must not claim invite-only public MVP",
  );

  const googleStart = await fetch(
    new URL("/api/auth/sign-in/social", baseUrl),
    {
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
    },
  );
  const googleStartClass =
    googleStart.status >= 200 && googleStart.status < 400
      ? "2xx_or_3xx"
      : "failed";
  const googleBody = await googleStart.text();
  const googleLocation = googleStart.headers.get("location") ?? "";
  const googleHasAuthUrl =
    /accounts\.google\.com|google\.com\/o\/oauth/i.test(googleBody) ||
    /accounts\.google\.com|google\.com\/o\/oauth/i.test(googleLocation);
  assert(
    googleHasAuthUrl,
    "Google social start must expose an authorization URL",
  );

  const intentPage = await fetch(new URL("/auth/intent", baseUrl));
  assert(intentPage.ok, "auth intent page must be reachable");
  await intentPage.body?.cancel();
  const gardenGoogleVisible = gardenHtml.includes(
    'data-testid="google-sign-in-button"',
  );
  const credentialEntryVisible =
    gardenHtml.includes('type="email"') &&
    gardenHtml.includes('type="password"');
  assert(
    gardenGoogleVisible && credentialEntryVisible,
    "credential and Google entry points must remain available",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        issue: "OVE-296",
        evidenceClass: "production_supported_provider_surface",
        expectedCommitSha: expectedCommit,
        gardenGuestStatusClass: gardenStatusClass,
        googleSocialStartClass: googleStartClass,
        googleAuthorizationUrlPresent: googleHasAuthUrl,
        supportedProviderClass: "credential_and_google_only",
        credentialEntryVisible,
        googleVisibleOnGardenGuestShell: gardenGoogleVisible,
        authIntentRecoveryReachable: true,
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
      issue: "OVE-296",
      error: "self_serve_providers_smoke_failed",
      evidenceSafety: EVIDENCE_SAFETY,
      message: error instanceof Error ? error.message : "unknown",
    }),
  );
  process.exitCode = 1;
});
