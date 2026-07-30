import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type CloseoutStatus = "done_on_main";

export type CloseoutEntry = {
  issueId: string;
  title: string;
  status: CloseoutStatus;
  requiredForNextSlice: true;
  mainCommit: string;
  mainRef: "main";
  proofCommit?: string;
  proofCommitReason?: "closeout_only_descendant";
  branchOnlyAuditCommit?: string;
  linearUrl: string;
  ciRunUrl: string;
  githubDeploymentId?: number;
  githubDeploymentStatusId?: number;
  completedAt: string;
  verificationCommands: string[];
  notes?: string[];
};

export type CloseoutLedger = {
  schemaVersion: 2;
  updatedAt: string;
  canonicalDoc: string;
  nextAgentCommand: string;
  entries: CloseoutEntry[];
};

export const REQUIRED_LEDGER_ISSUES = [
  "OVE-29",
  "OVE-30",
  "OVE-163",
  "OVE-170",
  "OVE-171",
  "OVE-188",
  "OVE-189",
  "OVE-190",
  "OVE-192",
  "OVE-193",
  "OVE-194",
  "OVE-195",
  "OVE-196",
  "OVE-197",
  "OVE-198",
  "OVE-200",
  "OVE-201",
  "OVE-202",
  "OVE-203",
  "OVE-204",
  "OVE-205",
  "OVE-206",
  "OVE-207",
  "OVE-208",
  "OVE-209",
  "OVE-210",
  "OVE-211",
  "OVE-212",
  "OVE-214",
  "OVE-236",
  "OVE-225",
  "OVE-233",
  "OVE-234",
  "OVE-235",
  "OVE-238",
  "OVE-242",
] as const;

export const CANONICAL_ORIGIN_URL =
  "https://github.com/yehor-design/over.garden";
export const FETCH_TIMEOUT_MS = 30_000;
export const CI_PROOF_TIMEOUT_MS = 30_000;
export const CANONICAL_LEDGER_DOC = "docs/MAINLINE_CLOSEOUT.md";
export const CANONICAL_NEXT_AGENT_COMMAND =
  "cd apps/web && pnpm mainline:closeout:check";
export const PROJECT_CALENDAR_TIME_ZONE = "Europe/Sofia";
export const CANONICAL_ACTIONS_WORKFLOW_ID = 302590914;
export const CANONICAL_ACTIONS_WORKFLOW_NAME = "CI";
export const CANONICAL_ACTIONS_WORKFLOW_PATH = ".github/workflows/ci.yml";
export const CANONICAL_ACTIONS_EVENTS = new Set(["push", "workflow_dispatch"]);
export const PROOF_COMMIT_ALLOWED_PATHS = new Set([
  "docs/MAINLINE_CLOSEOUT.md",
  "docs/mainline-closeout-ledger.json",
]);
export const VERCEL_GITHUB_APP = {
  login: "vercel[bot]",
  id: 35613825,
  type: "Bot",
} as const;

const CANONICAL_GITHUB_ACTIONS_RUN_URL =
  /^https:\/\/github\.com\/yehor-design\/over\.garden\/actions\/runs\/[1-9]\d*$/;
const CANONICAL_VERCEL_DEPLOYMENT_URL =
  /^https:\/\/vercel\.com\/yehors-projects-01221e2b\/over-garden\/[A-Za-z0-9]{24,64}$/;

export async function main() {
  const repoRoot = runGit(["rev-parse", "--show-toplevel"], process.cwd());
  const ledgerPath = path.join(
    repoRoot,
    "docs",
    "mainline-closeout-ledger.json",
  );
  let ledger: CloseoutLedger;
  try {
    ledger = parseLedger(JSON.parse(readFileSync(ledgerPath, "utf8")));
  } catch (error) {
    console.error(
      `Mainline closeout guard failed:\n- ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
    return;
  }
  const failures: string[] = [];
  const summaries: string[] = [];

  const trustedPullRequest = assertTrustedPullRequestContext(
    repoRoot,
    failures,
  );
  assertMainCheckout(repoRoot, trustedPullRequest, failures);
  assertCleanWorktree(repoRoot, failures);
  const canonicalOrigin = assertCanonicalOrigin(repoRoot, failures);
  const originMainAvailable =
    canonicalOrigin &&
    fetchAndAssertOriginMain(repoRoot, trustedPullRequest, failures);
  if (canonicalOrigin) {
    const proofReadback = await verifyLedgerCiProofs(ledger.entries, failures);
    if (proofReadback) {
      summaries.push(
        `${ledger.entries.length} CI/deployment proof URLs passed authenticated exact-SHA outcome read-back.`,
      );
    }
  }

  for (const entry of ledger.entries) {
    if (!isAncestor(repoRoot, entry.mainCommit, "HEAD")) {
      failures.push(
        `${entry.issueId}: ${entry.mainCommit} is not contained in HEAD.`,
      );
      continue;
    }

    const proofCommit = entry.proofCommit ?? entry.mainCommit;
    if (!isAncestor(repoRoot, proofCommit, "HEAD")) {
      failures.push(
        `${entry.issueId}: proofCommit ${proofCommit} is not contained in HEAD.`,
      );
      continue;
    }
    if (proofCommit !== entry.mainCommit) {
      const relationshipFailures = getProofCommitExceptionFailures(
        entry,
        runGit(["rev-list", "--parents", "-n", "1", proofCommit], repoRoot),
        runGit(
          ["diff-tree", "--no-commit-id", "--name-only", "-r", proofCommit],
          repoRoot,
        ),
      );
      if (relationshipFailures.length > 0) {
        failures.push(...relationshipFailures);
        continue;
      }
    }

    if (!originMainAvailable) {
      continue;
    }

    if (!isAncestor(repoRoot, entry.mainCommit, "origin/main")) {
      failures.push(
        `${entry.issueId}: ${entry.mainCommit} is not contained in origin/main.`,
      );
      continue;
    }
    if (!isAncestor(repoRoot, proofCommit, "origin/main")) {
      failures.push(
        `${entry.issueId}: proofCommit ${proofCommit} is not contained in origin/main.`,
      );
      continue;
    }

    summaries.push(
      `${entry.issueId}: ${entry.mainCommit} is contained in HEAD and origin/main.`,
    );
  }

  if (failures.length > 0) {
    console.error(
      ["Mainline closeout guard failed:", ...failures].join("\n- "),
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    [
      `Mainline closeout ledger OK (${ledger.updatedAt}).`,
      ...summaries.map((summary) => `- ${summary}`),
      `Next agent command: ${ledger.nextAgentCommand}`,
    ].join("\n"),
  );
}

export function getProofCommitExceptionFailures(
  entry: Pick<
    CloseoutEntry,
    "issueId" | "mainCommit" | "proofCommit" | "proofCommitReason"
  >,
  revisionWithParents: string,
  changedPaths: string,
) {
  const failures: string[] = [];
  const proofCommit = entry.proofCommit;
  if (!proofCommit) return failures;

  if (entry.proofCommitReason !== "closeout_only_descendant") {
    failures.push(
      `${entry.issueId}: proofCommit requires proofCommitReason closeout_only_descendant.`,
    );
  }

  const revisionParts = revisionWithParents.trim().split(/\s+/).filter(Boolean);
  if (
    revisionParts.length !== 2 ||
    revisionParts[0] !== proofCommit ||
    revisionParts[1] !== entry.mainCommit
  ) {
    failures.push(
      `${entry.issueId}: proofCommit ${proofCommit} must be the single-parent direct child of mainCommit ${entry.mainCommit}.`,
    );
  }

  const paths = changedPaths
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
  const disallowedPaths = paths.filter(
    (value) => !PROOF_COMMIT_ALLOWED_PATHS.has(value),
  );
  if (paths.length === 0 || disallowedPaths.length > 0) {
    failures.push(
      `${entry.issueId}: proofCommit may change only closeout canon (${[...PROOF_COMMIT_ALLOWED_PATHS].join(", ")}); found ${paths.length === 0 ? "no changed paths" : disallowedPaths.join(", ")}.`,
    );
  }

  return failures;
}

type FetchSpawnOptions = {
  cwd: string;
  encoding: "utf8";
  env: NodeJS.ProcessEnv;
  stdio: ["ignore", "pipe", "pipe"];
  timeout: number;
};

type FetchSpawnResult = {
  error?: Error;
  status: number | null;
  stderr: string;
};

type FetchSpawn = (
  args: string[],
  options: FetchSpawnOptions,
) => FetchSpawnResult;

const defaultFetchSpawn: FetchSpawn = (args, options) => {
  const result = spawnSync("git", args, options);
  return {
    error: result.error,
    status: result.status,
    stderr: result.stderr,
  };
};

export function fetchAndAssertOriginMain(
  repoRoot: string,
  trustedPullRequest: boolean,
  failures: string[],
  spawnFetch: FetchSpawn = defaultFetchSpawn,
) {
  const fetchResult = spawnFetch(
    [
      "fetch",
      "--no-tags",
      "origin",
      "+refs/heads/main:refs/remotes/origin/main",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GCM_INTERACTIVE: "Never",
        GIT_SSH_COMMAND: "ssh -oBatchMode=yes -oConnectTimeout=15",
      },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: FETCH_TIMEOUT_MS,
    },
  );
  if (fetchResult.error || fetchResult.status !== 0) {
    const detail =
      fetchResult.error?.message ||
      fetchResult.stderr.trim() ||
      `exit ${fetchResult.status ?? "unknown"}`;
    failures.push(
      `could not fetch current canonical origin/main within ${FETCH_TIMEOUT_MS / 1000} seconds; freshness is unproved: ${detail}.`,
    );
    return false;
  }

  if (!hasGitRef(repoRoot, "origin/main")) {
    failures.push(
      "origin/main is unavailable after a successful fetch; do not use this guard for task selection or closeout.",
    );
    return false;
  }

  const head = runGit(["rev-parse", "HEAD"], repoRoot);
  const originMain = runGit(["rev-parse", "origin/main"], repoRoot);
  const freshnessFailure = getFetchedHeadFailure(
    head,
    originMain,
    trustedPullRequest,
    isAncestor(repoRoot, originMain, head),
  );
  if (freshnessFailure) {
    failures.push(freshnessFailure);
    return false;
  }

  return true;
}

export function getFetchedHeadFailure(
  head: string,
  originMain: string,
  trustedPullRequest: boolean,
  originMainIsAncestor: boolean,
): string | undefined {
  if (trustedPullRequest && !originMainIsAncestor) {
    return "checked-out pull-request ref does not contain fetched origin/main; update the branch or rerun against the current base before using this guard.";
  }
  if (!trustedPullRequest && head !== originMain) {
    return `checked-out main ${head} differs from fetched origin/main ${originMain}; fetch and fast-forward before task selection or closeout.`;
  }
  return undefined;
}

function assertCanonicalOrigin(repoRoot: string, failures: string[]) {
  let originUrl: string;
  try {
    originUrl = runGit(["remote", "get-url", "origin"], repoRoot);
  } catch {
    failures.push(
      "origin remote is unavailable; configure origin for the canonical OverGarden repository before using this guard.",
    );
    return false;
  }

  const normalized = normalizeOriginUrl(originUrl);
  if (normalized !== CANONICAL_ORIGIN_URL.toLowerCase()) {
    failures.push(
      "origin does not resolve to the canonical yehor-design/over.garden repository; a fork-local main cannot prove OverGarden mainline freshness.",
    );
    return false;
  }

  return true;
}

export function normalizeOriginUrl(originUrl: string) {
  return originUrl
    .trim()
    .replace(/^git@github\.com:/i, "https://github.com/")
    .replace(/^ssh:\/\/git@github\.com\//i, "https://github.com/")
    .replace(/\.git$/i, "")
    .toLowerCase();
}

function assertCleanWorktree(repoRoot: string, failures: string[]) {
  const dirtyPaths = runGit(
    ["status", "--porcelain=v1", "--untracked-files=normal"],
    repoRoot,
  );
  if (!isGitStatusClean(dirtyPaths)) {
    failures.push(
      "worktree is not Git-clean; reconcile every tracked and non-ignored untracked path before using this guard.",
    );
  }
}

export function isGitStatusClean(porcelain: string) {
  return porcelain.trim().length === 0;
}

export function parseLedger(
  value: unknown,
  today: Date = new Date(),
): CloseoutLedger {
  if (!isRecord(value)) {
    throw new Error("Mainline closeout ledger must be a JSON object.");
  }
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "updatedAt",
      "canonicalDoc",
      "nextAgentCommand",
      "entries",
    ],
    "ledger",
  );

  if (value.schemaVersion !== 2) {
    throw new Error("Unsupported mainline closeout ledger schemaVersion.");
  }
  if (
    typeof value.updatedAt !== "string" ||
    !isValidNonFutureIsoDate(value.updatedAt, today)
  ) {
    throw new Error(
      "Mainline closeout ledger updatedAt must be a real, non-future YYYY-MM-DD date.",
    );
  }
  if (value.canonicalDoc !== CANONICAL_LEDGER_DOC) {
    throw new Error(
      `Mainline closeout ledger canonicalDoc must be ${CANONICAL_LEDGER_DOC}.`,
    );
  }
  if (value.nextAgentCommand !== CANONICAL_NEXT_AGENT_COMMAND) {
    throw new Error(
      `Mainline closeout ledger nextAgentCommand must be exactly ${CANONICAL_NEXT_AGENT_COMMAND}.`,
    );
  }
  if (!Array.isArray(value.entries)) {
    throw new Error("Mainline closeout ledger entries must be an array.");
  }

  const entries = value.entries.map((entry, index) =>
    parseCloseoutEntry(entry, index, today),
  );
  const inventoryFailures = getLedgerInventoryFailures(entries);
  if (inventoryFailures.length > 0) {
    throw new Error(inventoryFailures.join(" "));
  }

  return {
    schemaVersion: 2,
    updatedAt: value.updatedAt,
    canonicalDoc: CANONICAL_LEDGER_DOC,
    nextAgentCommand: CANONICAL_NEXT_AGENT_COMMAND,
    entries,
  };
}

function parseCloseoutEntry(
  value: unknown,
  index: number,
  today: Date,
): CloseoutEntry {
  const label = `Mainline closeout ledger entry ${index + 1}`;
  if (!isRecord(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  assertExactKeys(
    value,
    [
      "issueId",
      "title",
      "status",
      "requiredForNextSlice",
      "mainCommit",
      "mainRef",
      "proofCommit",
      "proofCommitReason",
      "branchOnlyAuditCommit",
      "linearUrl",
      "ciRunUrl",
      "githubDeploymentId",
      "githubDeploymentStatusId",
      "completedAt",
      "verificationCommands",
      "notes",
    ],
    label,
  );

  const issueId = requireNonEmptyString(value.issueId, `${label}.issueId`);
  if (!/^OVE-\d+$/.test(issueId)) {
    throw new Error(`${label}.issueId must look like OVE-123.`);
  }
  const title = requireNonEmptyString(value.title, `${issueId}.title`);
  if (value.status !== "done_on_main") {
    throw new Error(`${issueId}.status must be done_on_main.`);
  }
  if (value.requiredForNextSlice !== true) {
    throw new Error(
      `${issueId}.requiredForNextSlice must be true; remove non-prerequisite history instead of opting it out.`,
    );
  }
  const mainCommit = requireNonEmptyString(
    value.mainCommit,
    `${issueId}.mainCommit`,
  );
  if (!/^[0-9a-f]{40}$/.test(mainCommit)) {
    throw new Error(`${issueId}.mainCommit must be a 40-character SHA.`);
  }
  if (value.mainRef !== "main") {
    throw new Error(`${issueId}.mainRef must be main.`);
  }
  const proofCommit =
    value.proofCommit === undefined
      ? undefined
      : requireNonEmptyString(value.proofCommit, `${issueId}.proofCommit`);
  if (proofCommit !== undefined && !/^[0-9a-f]{40}$/.test(proofCommit)) {
    throw new Error(`${issueId}.proofCommit must be a 40-character SHA.`);
  }
  const proofCommitReason =
    value.proofCommitReason === undefined
      ? undefined
      : requireNonEmptyString(
          value.proofCommitReason,
          `${issueId}.proofCommitReason`,
        );
  if (
    (proofCommit === undefined) !== (proofCommitReason === undefined) ||
    (proofCommit !== undefined && proofCommit === mainCommit) ||
    (proofCommitReason !== undefined &&
      proofCommitReason !== "closeout_only_descendant")
  ) {
    throw new Error(
      `${issueId}.proofCommit is an exceptional, non-redundant direct-child closeout proof and must pair exactly with proofCommitReason closeout_only_descendant.`,
    );
  }
  const branchOnlyAuditCommit =
    value.branchOnlyAuditCommit === undefined
      ? undefined
      : requireNonEmptyString(
          value.branchOnlyAuditCommit,
          `${issueId}.branchOnlyAuditCommit`,
        );
  if (
    branchOnlyAuditCommit !== undefined &&
    !/^[0-9a-f]{7,40}$/.test(branchOnlyAuditCommit)
  ) {
    throw new Error(
      `${issueId}.branchOnlyAuditCommit must be a 7-to-40-character lowercase SHA.`,
    );
  }

  const linearUrl = requireNonEmptyString(
    value.linearUrl,
    `${issueId}.linearUrl`,
  );
  const expectedLinearPrefix = `https://linear.app/overgarden/issue/${issueId}`;
  if (
    linearUrl !== expectedLinearPrefix &&
    !linearUrl.startsWith(`${expectedLinearPrefix}/`)
  ) {
    throw new Error(
      `${issueId}.linearUrl must point to the same OverGarden issue identifier.`,
    );
  }
  const ciRunUrl = requireNonEmptyString(value.ciRunUrl, `${issueId}.ciRunUrl`);
  if (!isCanonicalCiProofUrl(ciRunUrl)) {
    throw new Error(
      `${issueId}.ciRunUrl must be an exact canonical numeric Actions run URL or OverGarden Vercel team/project deployment URL.`,
    );
  }
  const isVercelProof = CANONICAL_VERCEL_DEPLOYMENT_URL.test(ciRunUrl);
  const githubDeploymentId = value.githubDeploymentId;
  const githubDeploymentStatusId = value.githubDeploymentStatusId;
  if (
    isVercelProof &&
    (!Number.isSafeInteger(githubDeploymentId) ||
      Number(githubDeploymentId) <= 0 ||
      !Number.isSafeInteger(githubDeploymentStatusId) ||
      Number(githubDeploymentStatusId) <= 0)
  ) {
    throw new Error(
      `${issueId} Vercel proof requires positive integer githubDeploymentId and githubDeploymentStatusId receipts.`,
    );
  }
  if (
    !isVercelProof &&
    (githubDeploymentId !== undefined || githubDeploymentStatusId !== undefined)
  ) {
    throw new Error(
      `${issueId} Actions proof must not declare Vercel GitHub deployment receipts.`,
    );
  }
  const completedAt = requireNonEmptyString(
    value.completedAt,
    `${issueId}.completedAt`,
  );
  if (!isValidNonFutureIsoDate(completedAt, today)) {
    throw new Error(
      `${issueId}.completedAt must be a real, non-future YYYY-MM-DD date.`,
    );
  }
  if (
    !Array.isArray(value.verificationCommands) ||
    value.verificationCommands.length < 2 ||
    value.verificationCommands.some(
      (command) =>
        typeof command !== "string" ||
        !command.trim() ||
        /^(?:true|false|:|echo(?:\s|$)|printf(?:\s|$)|sleep(?:\s|$))/.test(
          command.trim(),
        ),
    )
  ) {
    throw new Error(
      `${issueId}.verificationCommands must contain at least two non-empty, non-trivial proof commands; true/false/echo/printf/sleep cannot stand in for evidence.`,
    );
  }
  if (
    value.notes !== undefined &&
    (!Array.isArray(value.notes) ||
      value.notes.some((note) => typeof note !== "string" || !note.trim()))
  ) {
    throw new Error(`${issueId}.notes must be an array of non-empty strings.`);
  }

  return {
    issueId,
    title,
    status: "done_on_main",
    requiredForNextSlice: true,
    mainCommit,
    mainRef: "main",
    ...(proofCommit ? { proofCommit } : {}),
    ...(proofCommitReason
      ? { proofCommitReason: "closeout_only_descendant" as const }
      : {}),
    ...(branchOnlyAuditCommit ? { branchOnlyAuditCommit } : {}),
    linearUrl,
    ciRunUrl,
    ...(isVercelProof
      ? {
          githubDeploymentId: githubDeploymentId as number,
          githubDeploymentStatusId: githubDeploymentStatusId as number,
        }
      : {}),
    completedAt,
    verificationCommands: value.verificationCommands as string[],
    ...(value.notes === undefined ? {} : { notes: value.notes as string[] }),
  };
}

export function getLedgerInventoryFailures(
  entries: ReadonlyArray<Pick<CloseoutEntry, "issueId">>,
): string[] {
  const failures: string[] = [];
  const issueCounts = new Map<string, number>();
  const requiredIssueSet = new Set<string>(REQUIRED_LEDGER_ISSUES);
  for (const entry of entries) {
    issueCounts.set(entry.issueId, (issueCounts.get(entry.issueId) ?? 0) + 1);
  }
  for (const issueId of REQUIRED_LEDGER_ISSUES) {
    if (!issueCounts.has(issueId)) {
      failures.push(`${issueId}: missing required mainline closeout entry.`);
    }
  }
  for (const [issueId, count] of issueCounts) {
    if (!requiredIssueSet.has(issueId)) {
      failures.push(
        `${issueId}: entry is absent from the schema-v2 pinned prerequisite inventory.`,
      );
    }
    if (count > 1) {
      failures.push(
        `${issueId}: duplicate mainline closeout entries (${count}).`,
      );
    }
  }
  return failures;
}

function assertTrustedPullRequestContext(repoRoot: string, failures: string[]) {
  const head = runGit(["rev-parse", "HEAD"], repoRoot);
  const context = classifyPullRequestContext(head, process.env);
  if (context.claimed && !context.trusted) {
    failures.push(
      "pull-request mode is trusted only for the yehor-design/over.garden GitHub Actions repository when checked-out HEAD exactly equals the 40-character GITHUB_SHA event revision.",
    );
  }
  return context.trusted;
}

export function classifyPullRequestContext(
  head: string,
  environment: NodeJS.ProcessEnv,
): { claimed: boolean; trusted: boolean } {
  const claimed =
    environment.GITHUB_EVENT_NAME === "pull_request" &&
    environment.GITHUB_BASE_REF === "main";
  if (!claimed) return { claimed: false, trusted: false };

  const eventSha = environment.GITHUB_SHA ?? "";
  const trusted =
    environment.GITHUB_ACTIONS === "true" &&
    environment.GITHUB_REPOSITORY === "yehor-design/over.garden" &&
    /^[0-9a-f]{40}$/.test(eventSha) &&
    head === eventSha;
  return { claimed: true, trusted };
}

function assertMainCheckout(
  repoRoot: string,
  trustedPullRequest: boolean,
  failures: string[],
) {
  const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot);
  const githubRef = process.env.GITHUB_REF_NAME;
  const effectiveRef = githubRef ?? branch;

  if (trustedPullRequest) {
    return;
  }

  if (effectiveRef !== "main") {
    failures.push(
      `checked-out ref is ${effectiveRef}; run this guard from current main before selecting the next Linear issue.`,
    );
  }
}

function isAncestor(repoRoot: string, ancestor: string, descendant: string) {
  const result = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", ancestor, descendant],
    {
      cwd: repoRoot,
      stdio: "ignore",
    },
  );

  return result.status === 0;
}

function hasGitRef(repoRoot: string, ref: string) {
  const result = spawnSync("git", ["rev-parse", "--verify", "--quiet", ref], {
    cwd: repoRoot,
    stdio: "ignore",
  });

  return result.status === 0;
}

function runGit(args: string[], cwd: string) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.stderr.trim() || result.status}`,
    );
  }

  return result.stdout.trim();
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string,
) {
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new Error(`${label} contains unknown fields: ${unknown.join(", ")}.`);
  }
}

function requireNonEmptyString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

export function isValidNonFutureIsoDate(
  value: string,
  today: Date = new Date(),
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf())) return false;
  if (parsed.toISOString().slice(0, 10) !== value) return false;
  return value <= projectCalendarDate(today);
}

export function isCanonicalCiProofUrl(value: string) {
  return (
    CANONICAL_GITHUB_ACTIONS_RUN_URL.test(value) ||
    CANONICAL_VERCEL_DEPLOYMENT_URL.test(value)
  );
}

type GithubJsonFetch = (url: string, token: string) => Promise<unknown>;

const defaultGithubJsonFetch: GithubJsonFetch = async (url, token) => {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "overgarden-mainline-closeout",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(CI_PROOF_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`GitHub API returned HTTP ${response.status}`);
  }
  return response.json() as Promise<unknown>;
};

export async function verifyLedgerCiProofs(
  entries: ReadonlyArray<CloseoutEntry>,
  failures: string[],
  fetchJson: GithubJsonFetch = defaultGithubJsonFetch,
  resolveToken: () => string = resolveGithubToken,
) {
  let token: string;
  try {
    token = resolveToken();
  } catch (error) {
    failures.push(
      `authenticated GitHub CI/deployment proof read-back is unavailable: ${error instanceof Error ? error.message : String(error)}.`,
    );
    return false;
  }

  const readbacks = await Promise.allSettled(
    entries.map(async (entry) => {
      const actionRun = entry.ciRunUrl.match(CANONICAL_GITHUB_ACTIONS_RUN_URL);
      let payload: unknown;
      let deploymentStatuses: unknown;
      if (actionRun) {
        payload = await fetchJson(
          `https://api.github.com/repos/yehor-design/over.garden/actions/runs/${entry.ciRunUrl.split("/").at(-1)}`,
          token,
        );
      } else {
        const deploymentId = entry.githubDeploymentId;
        [payload, deploymentStatuses] = await Promise.all([
          fetchJson(
            `https://api.github.com/repos/yehor-design/over.garden/deployments/${deploymentId}`,
            token,
          ),
          fetchJson(
            `https://api.github.com/repos/yehor-design/over.garden/deployments/${deploymentId}/statuses?per_page=100`,
            token,
          ),
        ]);
      }
      const failure = getCiProofReadbackFailure(
        entry,
        payload,
        deploymentStatuses,
      );
      if (failure) throw new Error(failure);
    }),
  );

  for (const [index, readback] of readbacks.entries()) {
    if (readback.status === "rejected") {
      failures.push(
        `${entries[index]!.issueId}: CI/deployment proof read-back failed: ${readback.reason instanceof Error ? readback.reason.message : String(readback.reason)}.`,
      );
    }
  }
  return readbacks.every((readback) => readback.status === "fulfilled");
}

export function getCiProofReadbackFailure(
  entry: Pick<
    CloseoutEntry,
    | "ciRunUrl"
    | "issueId"
    | "mainCommit"
    | "proofCommit"
    | "githubDeploymentId"
    | "githubDeploymentStatusId"
  >,
  payload: unknown,
  deploymentStatuses?: unknown,
): string | undefined {
  const proofCommit = entry.proofCommit ?? entry.mainCommit;
  if (!isRecord(payload)) return "response is not a JSON object";

  const actionRunId = entry.ciRunUrl.match(/\/actions\/runs\/([1-9]\d*)$/)?.[1];
  if (actionRunId) {
    const repository = isRecord(payload.repository)
      ? payload.repository.full_name
      : undefined;
    if (repository !== "yehor-design/over.garden") {
      return "response repository is not yehor-design/over.garden";
    }
    if (
      payload.id !== Number(actionRunId) ||
      payload.html_url !== entry.ciRunUrl
    ) {
      return "Actions run identity/URL differs from the ledger";
    }
    if (
      payload.workflow_id !== CANONICAL_ACTIONS_WORKFLOW_ID ||
      payload.name !== CANONICAL_ACTIONS_WORKFLOW_NAME ||
      payload.path !== CANONICAL_ACTIONS_WORKFLOW_PATH ||
      typeof payload.event !== "string" ||
      !CANONICAL_ACTIONS_EVENTS.has(payload.event)
    ) {
      return "Actions run is not the canonical CI workflow/path with an allowed mainline proof event";
    }
    if (payload.head_sha !== proofCommit) {
      return `Actions head SHA ${String(payload.head_sha)} differs from proof commit ${proofCommit}`;
    }
    if (payload.status !== "completed" || payload.conclusion !== "success") {
      return `Actions run is ${String(payload.status)}/${String(payload.conclusion)}, not completed/success`;
    }
    return undefined;
  }

  const deploymentId = entry.githubDeploymentId;
  const statusId = entry.githubDeploymentStatusId;
  const deploymentApiUrl = `https://api.github.com/repos/yehor-design/over.garden/deployments/${deploymentId}`;
  if (
    payload.id !== deploymentId ||
    payload.url !== deploymentApiUrl ||
    payload.statuses_url !== `${deploymentApiUrl}/statuses`
  ) {
    return "GitHub deployment identity/URL differs from the ledger";
  }
  if (payload.sha !== proofCommit || payload.ref !== proofCommit) {
    return `GitHub deployment SHA/ref differs from proof commit ${proofCommit}`;
  }
  if (
    payload.task !== "deploy" ||
    payload.environment !== "Production" ||
    payload.original_environment !== "Production" ||
    !isVercelGithubApp(payload.creator)
  ) {
    return "GitHub deployment is not the canonical Vercel Production deployment contract";
  }
  if (!Array.isArray(deploymentStatuses) || deploymentStatuses.length === 0) {
    return "GitHub deployment status read-back is empty or malformed";
  }
  if (
    deploymentStatuses.some(
      (status) =>
        !isRecord(status) ||
        !Number.isSafeInteger(status.id) ||
        typeof status.created_at !== "string" ||
        Number.isNaN(Date.parse(status.created_at)),
    )
  ) {
    return "GitHub deployment status read-back contains a malformed status";
  }
  const orderedStatuses = [...deploymentStatuses].sort((left, right) => {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const timeDifference =
      Date.parse(String(rightRecord.created_at)) -
      Date.parse(String(leftRecord.created_at));
    return timeDifference !== 0
      ? timeDifference
      : Number(rightRecord.id) - Number(leftRecord.id);
  }) as Array<Record<string, unknown>>;
  const latestStatus = orderedStatuses[0]!;
  if (latestStatus.id !== statusId) {
    return `latest GitHub deployment status ${String(latestStatus.id)} differs from ledger status ${String(statusId)}`;
  }
  if (
    latestStatus.state !== "success" ||
    latestStatus.environment !== "Production" ||
    !isVercelGithubApp(latestStatus.creator)
  ) {
    return "latest GitHub deployment status is not a successful canonical Vercel Production receipt";
  }
  const immutableDeploymentUrl = latestStatus.environment_url;
  if (
    typeof immutableDeploymentUrl !== "string" ||
    !/^https:\/\/over-garden-[a-z0-9]+-yehors-projects-01221e2b\.vercel\.app$/.test(
      immutableDeploymentUrl,
    ) ||
    latestStatus.target_url !== immutableDeploymentUrl ||
    latestStatus.log_url !== immutableDeploymentUrl
  ) {
    return "latest GitHub deployment status lacks one matching immutable OverGarden Vercel environment/target/log URL";
  }
  return undefined;
}

function isVercelGithubApp(value: unknown) {
  return (
    isRecord(value) &&
    value.login === VERCEL_GITHUB_APP.login &&
    value.id === VERCEL_GITHUB_APP.id &&
    value.type === VERCEL_GITHUB_APP.type
  );
}

function resolveGithubToken() {
  const environmentToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (environmentToken?.trim()) return environmentToken.trim();

  const result = spawnSync("gh", ["auth", "token"], {
    encoding: "utf8",
    env: {
      ...process.env,
      GH_PROMPT_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5_000,
  });
  const token = result.stdout?.trim() ?? "";
  if (result.error || result.status !== 0 || !token) {
    throw new Error(
      "set GH_TOKEN/GITHUB_TOKEN or authenticate gh; no proof URL is trusted from shape alone",
    );
  }
  return token;
}

function projectCalendarDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PROJECT_CALENDAR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(
      `Mainline closeout guard failed:\n- ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
