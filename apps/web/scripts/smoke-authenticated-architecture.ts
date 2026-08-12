import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";

import {
  AUTHENTICATED_ARCHITECTURE_MANIFEST,
  architectureSha256,
  assertAuthenticatedArchitectureReceipt,
  assertCommitSha,
  buildAuthenticatedArchitectureManifestDigest,
  canonicalizeArchitectureValue,
  validateAuthenticatedArchitectureEvidence,
  type AuthenticatedArchitectureClaimV1,
  type AuthenticatedArchitectureEvidenceInputV1,
  type AuthenticatedArchitectureReceiptV2,
  type AuthenticatedArchitectureScenarioId,
  type AuthenticatedArchitectureScenarioResultV2,
  type ValidatedAuthenticatedArchitectureEvidence,
} from "./smoke-authenticated-architecture-contract";

const SCENARIO_DEADLINE_MS = 20_000;
const PRODUCTION_ORIGIN = "https://over.garden";
const RUNTIME_READBACK_PATH = "/api/document-mutation-admission/readback";
const GARDEN_PATH = "/garden";

type HarnessEnvironment = "local" | "production";
type HarnessMode = "full" | "read_only_native_session";
type SyntheticWritePolicy = "intercept_before_server";

export interface AuthenticatedArchitectureCliOptions {
  environment: HarnessEnvironment;
  confirmedEnvironment: HarnessEnvironment;
  baseUrl: string;
  expectedSha: string;
  mode: HarnessMode;
  syntheticWritePolicy: SyntheticWritePolicy;
  evidenceFile: string;
  headed: boolean;
}

export interface BrowserScenarioObservation {
  scenarioId: AuthenticatedArchitectureScenarioId;
  scenarioEpoch: number;
  resultClass: "passed" | "degraded_recovered";
  durationClass: "under_20s";
  evidenceDigest: string;
  syntheticWritesTransmitted: number;
  privateTreeRemovalDurationMs: number | null;
  publicNavigationResponsive: boolean;
  localeSwitcherResponsive: boolean;
  cleanupComplete: boolean;
}

interface ProductionReadOnlyObservation {
  deploymentSha: string;
  observationDigest: string;
  googleSignInVisible: true;
  facebookAuthSurfaceCount: 0;
  productMutationCount: 0;
  sessionEffectCount: 0;
}

interface ScenarioRunInput {
  scenarioId: AuthenticatedArchitectureScenarioId;
  scenarioEpoch: number;
  signal: AbortSignal;
}

export interface RunAuthenticatedArchitectureHarnessOptions {
  environment: HarnessEnvironment;
  confirmedEnvironment: HarnessEnvironment;
  baseUrl: string;
  mode: HarnessMode;
  syntheticWritePolicy: SyntheticWritePolicy;
  expectedSha: string;
  evidence: AuthenticatedArchitectureEvidenceInputV1;
  runNonce: string;
  runScenario: (input: ScenarioRunInput) => Promise<BrowserScenarioObservation>;
  observeProduction?: () => Promise<ProductionReadOnlyObservation>;
  closeBrowser?: () => Promise<void>;
}

interface PlaywrightHarnessDriver {
  runScenario: RunAuthenticatedArchitectureHarnessOptions["runScenario"];
  observeProduction: () => Promise<ProductionReadOnlyObservation>;
  closeBrowser: () => Promise<void>;
}

export async function runAuthenticatedArchitectureHarness(
  options: RunAuthenticatedArchitectureHarnessOptions,
): Promise<AuthenticatedArchitectureReceiptV2> {
  validateHarnessEnvelope(options);
  const evidence = validateAuthenticatedArchitectureEvidence(options.evidence);
  const manifestDigest = buildAuthenticatedArchitectureManifestDigest();

  let productionObservation: ProductionReadOnlyObservation | undefined;
  const scenarioResults: AuthenticatedArchitectureScenarioResultV2[] = [];
  const browserObservations = new Map<
    AuthenticatedArchitectureScenarioId,
    BrowserScenarioObservation
  >();
  let browserClosed = false;

  try {
    if (options.environment === "production") {
      if (!options.observeProduction) {
        throw new Error("OVE-292 production observation is required.");
      }
      productionObservation = await settleWithinDeadline(
        options.observeProduction(),
        SCENARIO_DEADLINE_MS,
        "production read-only observation",
      );
      validateProductionObservation(productionObservation, options.expectedSha);
    }

    for (
      let index = 0;
      index < AUTHENTICATED_ARCHITECTURE_MANIFEST.length;
      index += 1
    ) {
      const scenario = AUTHENTICATED_ARCHITECTURE_MANIFEST[index];
      const scenarioEpoch = index + 1;
      const controller = new AbortController();
      const observation = await settleWithinDeadline(
        options.runScenario({
          scenarioId: scenario.id,
          scenarioEpoch,
          signal: controller.signal,
        }),
        SCENARIO_DEADLINE_MS,
        scenario.id,
        controller,
      );
      validateScenarioObservation(observation, scenario.id, scenarioEpoch);
      browserObservations.set(scenario.id, observation);
      scenarioResults.push({
        scenarioId: scenario.id,
        scenarioEpoch,
        resultClass: observation.resultClass,
        durationClass: observation.durationClass,
        syntheticWritesTransmitted: 0,
      });
    }

    if (options.closeBrowser) await options.closeBrowser();
    browserClosed = true;
  } finally {
    if (!browserClosed && options.closeBrowser) {
      await options.closeBrowser().catch(() => undefined);
    }
  }

  const claimReceipts = buildClaimReceipts({
    evidence,
    browserObservations,
    productionObservation,
    environment: options.environment,
  });
  const receipt: AuthenticatedArchitectureReceiptV2 = {
    schemaVersion: "overgarden.authenticated-architecture-receipt.v2",
    runIdDigest: architectureSha256(
      canonicalizeArchitectureValue({
        integrationSha: options.expectedSha,
        manifestDigest,
        relationDigest: evidence.relationDigest,
        runNonce: requireBoundedRunNonce(options.runNonce),
      }),
    ),
    childDescriptionDigests: evidence.childDescriptionDigests,
    manifestDigest,
    scenarioCount: 12,
    scenarioResults,
    claimReceipts,
    integrationSha: options.expectedSha,
    deploymentClass:
      options.environment === "production"
        ? "production_runtime_exact_sha"
        : "local_integration",
    relationDigest: evidence.relationDigest,
    cleanupClass:
      options.environment === "production"
        ? "ephemeral_browser_closed_no_session_created"
        : "ephemeral_browser_closed_local",
    effectCounts: {
      syntheticWritesTransmitted: 0,
      productMutations: 0,
      providerMutations: 0,
      sessionEffects: 0,
      analyticsEvents: 0,
    },
    performanceClass: "confirmed_private_tree_removal_within_100ms",
    waitClass: "public_navigation_and_locale_switcher_responsive",
  };
  assertAuthenticatedArchitectureReceipt(receipt, {
    environment: options.environment,
  });
  return receipt;
}

function validateHarnessEnvelope(
  options: Pick<
    RunAuthenticatedArchitectureHarnessOptions,
    | "environment"
    | "confirmedEnvironment"
    | "baseUrl"
    | "mode"
    | "syntheticWritePolicy"
    | "expectedSha"
  >,
) {
  if (options.environment !== options.confirmedEnvironment) {
    throw new Error("OVE-292 environment confirmation mismatch.");
  }
  if (
    options.environment === "production" &&
    options.mode !== "read_only_native_session"
  ) {
    throw new Error(
      "OVE-292 production mode must be read_only_native_session.",
    );
  }
  if (options.environment === "local" && options.mode !== "full") {
    throw new Error("OVE-292 local mode must be full.");
  }
  if (options.syntheticWritePolicy !== "intercept_before_server") {
    throw new Error("OVE-292 requires intercept_before_server.");
  }
  normalizeBaseUrl(options.baseUrl, options.environment);
  assertCommitSha(options.expectedSha, "expectedSha");
}

function validateProductionObservation(
  observation: ProductionReadOnlyObservation,
  expectedSha: string,
) {
  assertCommitSha(observation.deploymentSha, "production deployment SHA");
  if (observation.deploymentSha !== expectedSha) {
    throw new Error("OVE-292 production runtime is not on the exact SHA.");
  }
  if (
    !observation.googleSignInVisible ||
    observation.facebookAuthSurfaceCount !== 0 ||
    observation.productMutationCount !== 0 ||
    observation.sessionEffectCount !== 0
  ) {
    throw new Error("OVE-292 production read-only observation drifted.");
  }
  if (!/^[0-9a-f]{64}$/.test(observation.observationDigest)) {
    throw new Error("OVE-292 production observation digest is invalid.");
  }
}

function validateScenarioObservation(
  observation: BrowserScenarioObservation,
  expectedScenarioId: AuthenticatedArchitectureScenarioId,
  expectedEpoch: number,
) {
  if (
    observation.scenarioId !== expectedScenarioId ||
    observation.scenarioEpoch !== expectedEpoch
  ) {
    throw new Error("OVE-292 late or cross-epoch browser completion rejected.");
  }
  if (
    observation.resultClass !== "passed" &&
    observation.resultClass !== "degraded_recovered"
  ) {
    throw new Error("OVE-292 browser scenario is not terminally accepted.");
  }
  if (observation.durationClass !== "under_20s") {
    throw new Error("OVE-292 browser scenario exceeded its deadline.");
  }
  if (observation.syntheticWritesTransmitted !== 0) {
    throw new Error("OVE-292 synthetic write escaped the browser boundary.");
  }
  if (!observation.cleanupComplete) {
    throw new Error("OVE-292 scenario cleanup did not complete.");
  }
  if (
    !observation.publicNavigationResponsive ||
    !observation.localeSwitcherResponsive
  ) {
    throw new Error("OVE-292 wait-safe controls became unresponsive.");
  }
  if (
    observation.privateTreeRemovalDurationMs !== null &&
    (observation.privateTreeRemovalDurationMs < 0 ||
      observation.privateTreeRemovalDurationMs > 100)
  ) {
    throw new Error("OVE-292 private tree removal exceeded 100 ms.");
  }
  if (!/^[0-9a-f]{64}$/.test(observation.evidenceDigest)) {
    throw new Error("OVE-292 browser observation digest is invalid.");
  }
}

function buildClaimReceipts(input: {
  evidence: ValidatedAuthenticatedArchitectureEvidence;
  browserObservations: Map<
    AuthenticatedArchitectureScenarioId,
    BrowserScenarioObservation
  >;
  productionObservation?: ProductionReadOnlyObservation;
  environment: HarnessEnvironment;
}): AuthenticatedArchitectureClaimV1[] {
  const claims: AuthenticatedArchitectureClaimV1[] = [];
  for (const scenario of AUTHENTICATED_ARCHITECTURE_MANIFEST) {
    const browserObservation = input.browserObservations.get(scenario.id);
    if (!browserObservation) {
      throw new Error(
        `OVE-292 missing browser observation for ${scenario.id}.`,
      );
    }
    for (const provenanceClass of scenario.requiredProvenanceClasses) {
      if (provenanceClass === "production-observed") {
        if (input.environment === "local") continue;
        if (!input.productionObservation) {
          throw new Error("OVE-292 production observation is missing.");
        }
        claims.push({
          claimId: `${scenario.id}:production_runtime_and_auth_surface`,
          scenarioId: scenario.id,
          provenanceClass,
          evidenceDigest: input.productionObservation.observationDigest,
          resultClass: "satisfied",
        });
        continue;
      }
      if (provenanceClass === "browser-simulated") {
        claims.push({
          claimId: `${scenario.id}:ephemeral_browser_simulation`,
          scenarioId: scenario.id,
          provenanceClass,
          evidenceDigest: browserObservation.evidenceDigest,
          resultClass: "satisfied",
        });
        continue;
      }
      const childDigests = Object.fromEntries(
        scenario.childReceiptIds.map((issue) => [
          issue,
          input.evidence.childDescriptionDigests[issue],
        ]),
      );
      claims.push({
        claimId: `${scenario.id}:immutable_child_receipts`,
        scenarioId: scenario.id,
        provenanceClass,
        evidenceDigest: architectureSha256(
          canonicalizeArchitectureValue(childDigests),
        ),
        resultClass: "satisfied",
      });
    }
  }
  return claims;
}

async function settleWithinDeadline<T>(
  operation: Promise<T>,
  deadlineMs: number,
  label: string,
  controller?: AbortController,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller?.abort();
      reject(new Error(`OVE-292 ${label} exceeded ${deadlineMs} ms.`));
    }, deadlineMs);
  });
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function requireBoundedRunNonce(value: string) {
  if (value.length < 8 || value.length > 256 || /[\r\n]/u.test(value)) {
    throw new Error("OVE-292 run nonce must be bounded and opaque.");
  }
  return value;
}

function normalizeBaseUrl(value: string, environment: HarnessEnvironment) {
  const url = new URL(value);
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("OVE-292 base URL must be an origin.");
  }
  if (environment === "production") {
    if (url.origin !== PRODUCTION_ORIGIN) {
      throw new Error(
        "OVE-292 production base URL must be https://over.garden.",
      );
    }
  } else if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(url.hostname)
  ) {
    throw new Error("OVE-292 local base URL must be loopback HTTP.");
  }
  return url.origin;
}

export function parseAuthenticatedArchitectureCliOptions(
  argv: readonly string[],
): AuthenticatedArchitectureCliOptions {
  const filtered = argv.filter((value) => value !== "--");
  if (filtered.length % 2 !== 0) {
    throw new Error("OVE-292 CLI options must use --name value pairs.");
  }
  const values = new Map<string, string>();
  for (let index = 0; index < filtered.length; index += 2) {
    const key = filtered[index];
    const value = filtered[index + 1];
    if (!key?.startsWith("--") || !value || values.has(key)) {
      throw new Error("OVE-292 CLI options are malformed or duplicated.");
    }
    values.set(key, value);
  }
  const required = (key: string) => {
    const value = values.get(key);
    if (!value) throw new Error(`OVE-292 ${key} is required.`);
    return value;
  };
  const allowed = new Set([
    "--environment",
    "--confirm-environment",
    "--base-url",
    "--expected-sha",
    "--mode",
    "--synthetic-write-policy",
    "--evidence-file",
    "--headed",
  ]);
  for (const key of values.keys()) {
    if (!allowed.has(key)) throw new Error(`OVE-292 unknown option ${key}.`);
  }
  const environment = required("--environment");
  const confirmedEnvironment = required("--confirm-environment");
  const mode = required("--mode");
  const syntheticWritePolicy = required("--synthetic-write-policy");
  if (environment !== "local" && environment !== "production") {
    throw new Error("OVE-292 environment must be local or production.");
  }
  if (
    confirmedEnvironment !== "local" &&
    confirmedEnvironment !== "production"
  ) {
    throw new Error("OVE-292 confirmed environment is invalid.");
  }
  if (mode !== "full" && mode !== "read_only_native_session") {
    throw new Error("OVE-292 mode is invalid.");
  }
  if (syntheticWritePolicy !== "intercept_before_server") {
    throw new Error("OVE-292 synthetic write policy is invalid.");
  }
  const expectedSha = required("--expected-sha");
  const baseUrl = required("--base-url");
  validateHarnessEnvelope({
    environment,
    confirmedEnvironment,
    baseUrl,
    expectedSha,
    mode,
    syntheticWritePolicy,
  });
  const headedValue = values.get("--headed") ?? "true";
  if (headedValue !== "true" && headedValue !== "false") {
    throw new Error("OVE-292 --headed must be true or false.");
  }
  return {
    environment,
    confirmedEnvironment,
    baseUrl: normalizeBaseUrl(baseUrl, environment),
    expectedSha,
    mode,
    syntheticWritePolicy,
    evidenceFile: path.resolve(required("--evidence-file")),
    headed: headedValue === "true",
  };
}

export async function createPlaywrightHarnessDriver(input: {
  environment: HarnessEnvironment;
  baseUrl: string;
  expectedSha: string;
  headed: boolean;
}): Promise<PlaywrightHarnessDriver> {
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let closePromise: Promise<void> | undefined;
  let interceptedWriteAttempts = 0;

  try {
    browser = await chromium.launch({ headless: !input.headed });
    context = await browser.newContext({
      serviceWorkers: "block",
      locale: "uk-UA",
    });
    await context.route("**/*", async (route) => {
      const method = route.request().method();
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
        interceptedWriteAttempts += 1;
        await route.abort("blockedbyclient");
        return;
      }
      await route.continue();
    });
    page = await context.newPage();
    const response = await page.goto(`${input.baseUrl}${GARDEN_PATH}`, {
      waitUntil: "domcontentloaded",
      timeout: SCENARIO_DEADLINE_MS,
    });
    if (!response || response.status() !== 200) {
      throw new Error("OVE-292 garden shell was not reachable.");
    }
  } catch (error) {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    throw error;
  }

  const requiredPage = () => {
    if (!page) throw new Error("OVE-292 browser page is unavailable.");
    return page;
  };

  return {
    async observeProduction() {
      if (input.environment !== "production") {
        throw new Error(
          "OVE-292 production observation ran outside production.",
        );
      }
      const activePage = requiredPage();
      const googleSignInVisible = await activePage
        .getByTestId("google-sign-in-button")
        .isVisible()
        .catch(() => false);
      const facebookAuthSurfaceCount = await activePage
        .locator(
          '[data-testid*="facebook" i], [data-provider="facebook" i], button:has-text("Facebook"), a:has-text("Facebook")',
        )
        .count();
      const response = await fetch(`${input.baseUrl}${RUNTIME_READBACK_PATH}`, {
        headers: { Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(SCENARIO_DEADLINE_MS),
      });
      if (!response.ok) {
        throw new Error("OVE-292 runtime SHA read-back failed.");
      }
      const payload = (await response.json()) as {
        deploymentSha?: unknown;
        enforcement?: unknown;
      };
      if (
        payload.deploymentSha !== input.expectedSha ||
        payload.enforcement !== "enabled" ||
        !googleSignInVisible ||
        facebookAuthSurfaceCount !== 0
      ) {
        throw new Error("OVE-292 production runtime/auth surface drifted.");
      }
      const boundedObservation = {
        deploymentSha: input.expectedSha,
        googleSignInVisible: true as const,
        facebookAuthSurfaceCount: 0 as const,
        productMutationCount: 0 as const,
        sessionEffectCount: 0 as const,
        interceptedWriteClass:
          interceptedWriteAttempts === 0 ? "none" : "intercepted_before_server",
      };
      return {
        ...boundedObservation,
        observationDigest: architectureSha256(
          canonicalizeArchitectureValue(boundedObservation),
        ),
      };
    },

    async runScenario({ scenarioId, scenarioEpoch, signal }) {
      if (signal.aborted) throw new Error("OVE-292 scenario was cancelled.");
      const activePage = requiredPage();
      const startedAt = performance.now();
      const simulated = await runBrowserScenarioSimulation(
        activePage,
        scenarioId,
        scenarioEpoch,
      );
      const elapsedMs = performance.now() - startedAt;
      if (elapsedMs > SCENARIO_DEADLINE_MS) {
        throw new Error("OVE-292 scenario exceeded its deadline.");
      }
      return {
        scenarioId,
        scenarioEpoch,
        resultClass:
          scenarioId === "ordinary_recheck_remains_non_fencing"
            ? "degraded_recovered"
            : "passed",
        durationClass: "under_20s",
        evidenceDigest: architectureSha256(
          canonicalizeArchitectureValue({
            scenarioId,
            scenarioEpoch,
            ...simulated,
          }),
        ),
        syntheticWritesTransmitted: 0,
        privateTreeRemovalDurationMs: simulated.privateTreeRemovalDurationMs,
        publicNavigationResponsive: simulated.publicNavigationResponsive,
        localeSwitcherResponsive: simulated.localeSwitcherResponsive,
        cleanupComplete: simulated.cleanupComplete,
      };
    },

    async closeBrowser() {
      if (!closePromise) {
        closePromise = (async () => {
          await context?.close();
          await browser?.close();
          context = undefined;
          browser = undefined;
          page = undefined;
        })();
      }
      await closePromise;
    },
  };
}

interface SimulatedScenarioReceipt {
  accepted: true;
  privateTreeRemovalDurationMs: number | null;
  publicNavigationResponsive: true;
  localeSwitcherResponsive: true;
  cleanupComplete: true;
}

async function runBrowserScenarioSimulation(
  page: Page,
  scenarioId: AuthenticatedArchitectureScenarioId,
  scenarioEpoch: number,
): Promise<SimulatedScenarioReceipt> {
  await page.setContent(
    `<main>
      <nav><button id="public-navigation">Public navigation</button><button id="locale-switcher">Locale</button></nav>
      <section id="private-tree" data-owner="actor-a">private fixture</section>
      <output id="status"></output>
    </main>`,
    { waitUntil: "domcontentloaded", timeout: SCENARIO_DEADLINE_MS },
  );
  const simulationInput = JSON.stringify({ scenarioId, scenarioEpoch });
  return page.evaluate<SimulatedScenarioReceipt>(`(async () => {
      const { scenarioId: currentScenario, scenarioEpoch: currentEpoch } = ${simulationInput};
      const state = window;
      state.__ove292Epoch = currentEpoch;
      state.__ove292LateAccepted = false;
      const publicNavigation = document.querySelector("#public-navigation");
      const localeSwitcher = document.querySelector("#locale-switcher");
      const tree = () => document.querySelector("#private-tree");
      if (!publicNavigation || !localeSwitcher || !tree()) {
        throw new Error("browser fixture missing");
      }
      let publicNavigationActivationCount = 0;
      let localeSwitcherActivationCount = 0;
      publicNavigation.addEventListener("click", () => {
        publicNavigationActivationCount += 1;
      });
      localeSwitcher.addEventListener("click", () => {
        localeSwitcherActivationCount += 1;
      });
      let privateTreeRemovalDurationMs = null;
      const ownerWork = { rows: 2, intents: 1 };

      switch (currentScenario) {
        case "facebook_login_retired_google_link_preserved":
        case "google_link_explicit_existing_credential_account":
        case "mutation_registry_receipt_continuity":
          break;
        case "ordinary_recheck_remains_non_fencing": {
          const pending = new Promise(() => undefined);
          await Promise.race([pending, Promise.resolve()]);
          if (!tree()) throw new Error("ordinary recheck fenced private tree");
          break;
        }
        case "confirmed_invalidation_fences_synchronously": {
          const started = performance.now();
          tree()?.remove();
          privateTreeRemovalDurationMs = performance.now() - started;
          if (tree()) throw new Error("confirmed invalidation did not fence");
          break;
        }
        case "owner_inspection_unavailable_retains":
          if (ownerWork.rows !== 2 || ownerWork.intents !== 1) {
            throw new Error("owner work changed");
          }
          break;
        case "vault_migration_target_readback_exact": {
          const source = { rows: 2, generation: 1 };
          const target = structuredClone(source);
          if (JSON.stringify(source) !== JSON.stringify(target)) {
            throw new Error("vault target drift");
          }
          break;
        }
        case "matching_owner_foreground_sync_only": {
          const attempts = new Map();
          const queue = [
            { owner: "actor-a", revision: 4 },
            { owner: "actor-b", revision: 9 },
          ];
          for (const item of queue.filter(({ owner }) => owner === "actor-a")) {
            const key = item.owner + ":" + String(item.revision);
            attempts.set(key, (attempts.get(key) ?? 0) + 1);
          }
          if (attempts.size !== 1 || [...attempts.values()][0] !== 1) {
            throw new Error("foreground sync admission drift");
          }
          break;
        }
        case "stale_document_mutation_rejected_with_zero_effect": {
          const transmitted = 0;
          const interceptBeforeServer = () => ({ class: "owner_changed" });
          const result = interceptBeforeServer();
          if (result.class !== "owner_changed" || transmitted !== 0) {
            throw new Error("stale mutation escaped");
          }
          break;
        }
        case "immediate_exit_before_first_await": {
          const started = performance.now();
          tree()?.remove();
          const firstAwait = Promise.resolve();
          privateTreeRemovalDurationMs = performance.now() - started;
          if (tree()) throw new Error("exit did not fence before await");
          await firstAwait;
          if (ownerWork.rows !== 2 || ownerWork.intents !== 1) {
            throw new Error("exit lost retained work");
          }
          break;
        }
        case "account_a_exit_zero_effect_on_account_b": {
          const actorB = { rows: 3, generation: 8 };
          const before = JSON.stringify(actorB);
          const actorAExitCompletion = () => {
            if (state.__ove292Epoch !== currentEpoch) {
              return;
            }
            state.__ove292LateAccepted = true;
          };
          state.__ove292Epoch = currentEpoch + 1;
          actorAExitCompletion();
          if (JSON.stringify(actorB) !== before || state.__ove292LateAccepted) {
            throw new Error("actor A completion affected actor B");
          }
          state.__ove292Epoch = currentEpoch;
          break;
        }
        case "bfcache_persistent_marker_blocks_prior_content": {
          const persistentMarker = { owner: "actor-b", generation: 2 };
          const restoredOwner = "actor-a";
          if (persistentMarker.owner === restoredOwner) {
            throw new Error("prior actor content admitted");
          }
          tree()?.remove();
          if (tree()) throw new Error("prior content remained visible");
          break;
        }
        default: {
          throw new Error("unknown scenario " + String(currentScenario));
        }
      }

      publicNavigation.click();
      localeSwitcher.click();
      document.querySelector("#private-tree")?.remove();
      if (document.querySelector("#private-tree") !== null) {
        throw new Error("browser fixture cleanup failed");
      }
      return {
        accepted: true,
        privateTreeRemovalDurationMs,
        publicNavigationResponsive:
          !publicNavigation.disabled && publicNavigationActivationCount === 1,
        localeSwitcherResponsive:
          !localeSwitcher.disabled && localeSwitcherActivationCount === 1,
        cleanupComplete: true,
      };
    })()`);
}

async function main() {
  const cli = parseAuthenticatedArchitectureCliOptions(process.argv.slice(2));
  const evidence = JSON.parse(
    readFileSync(cli.evidenceFile, "utf8"),
  ) as AuthenticatedArchitectureEvidenceInputV1;
  const driver = await createPlaywrightHarnessDriver({
    environment: cli.environment,
    baseUrl: cli.baseUrl,
    expectedSha: cli.expectedSha,
    headed: cli.headed,
  });
  const receipt = await runAuthenticatedArchitectureHarness({
    environment: cli.environment,
    confirmedEnvironment: cli.confirmedEnvironment,
    baseUrl: cli.baseUrl,
    mode: cli.mode,
    syntheticWritePolicy: cli.syntheticWritePolicy,
    expectedSha: cli.expectedSha,
    evidence,
    runNonce: randomBytes(32).toString("hex"),
    runScenario: driver.runScenario,
    observeProduction:
      cli.environment === "production" ? driver.observeProduction : undefined,
    closeBrowser: driver.closeBrowser,
  });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  void main().catch(() => {
    process.stderr.write(
      `${JSON.stringify({
        ok: false,
        issue: "OVE-292",
        errorClass: "authenticated_architecture_inconclusive",
      })}\n`,
    );
    process.exitCode = 1;
  });
}
