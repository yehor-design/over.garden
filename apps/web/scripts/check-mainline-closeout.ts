import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

type CloseoutStatus = "done_on_main" | "done_on_deployed_commit";

type CloseoutEntry = {
  issueId: string;
  title: string;
  status: CloseoutStatus;
  requiredForNextSlice: boolean;
  mainCommit?: string;
  mainRef?: string;
  linearUrl: string;
  ciRunUrl: string;
  completedAt: string;
  verificationCommands: string[];
  notes?: string[];
};

type CloseoutLedger = {
  schemaVersion: 1;
  updatedAt: string;
  canonicalDoc: string;
  nextAgentCommand: string;
  requiredBeforeNextLinearIssues: string[];
  entries: CloseoutEntry[];
};

const requiredBaselineIssues = ["OVE-29", "OVE-30"];

main();

function main() {
  const repoRoot = runGit(["rev-parse", "--show-toplevel"], process.cwd());
  const ledgerPath = path.join(
    repoRoot,
    "docs",
    "mainline-closeout-ledger.json",
  );
  const ledger = parseLedger(JSON.parse(readFileSync(ledgerPath, "utf8")));
  const failures: string[] = [];
  const summaries: string[] = [];

  assertMainCheckout(repoRoot, failures);
  assertRequiredBaselineIssues(ledger, failures);

  for (const entry of ledger.entries.filter(
    (candidate) => candidate.requiredForNextSlice,
  )) {
    validateEntryShape(entry, failures);

    if (entry.status === "done_on_main") {
      if (!entry.mainCommit) {
        failures.push(`${entry.issueId}: missing mainCommit.`);
        continue;
      }

      if (!isAncestor(repoRoot, entry.mainCommit, "HEAD")) {
        failures.push(
          `${entry.issueId}: ${entry.mainCommit} is not contained in HEAD.`,
        );
        continue;
      }

      const remoteChecked = hasGitRef(repoRoot, "origin/main");
      if (
        remoteChecked &&
        !isAncestor(repoRoot, entry.mainCommit, "origin/main")
      ) {
        failures.push(
          `${entry.issueId}: ${entry.mainCommit} is not contained in origin/main.`,
        );
        continue;
      }

      summaries.push(
        `${entry.issueId}: ${entry.mainCommit} is contained in HEAD${
          remoteChecked ? " and origin/main" : ""
        }.`,
      );
    } else {
      summaries.push(
        `${entry.issueId}: deployed-commit proof is recorded; verify deployment smoke evidence in ${ledger.canonicalDoc}.`,
      );
    }
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

function parseLedger(value: unknown): CloseoutLedger {
  if (!isRecord(value)) {
    throw new Error("Mainline closeout ledger must be a JSON object.");
  }

  const ledger = value as Partial<CloseoutLedger>;

  if (ledger.schemaVersion !== 1) {
    throw new Error("Unsupported mainline closeout ledger schemaVersion.");
  }

  if (
    typeof ledger.updatedAt !== "string" ||
    typeof ledger.canonicalDoc !== "string" ||
    typeof ledger.nextAgentCommand !== "string" ||
    !Array.isArray(ledger.requiredBeforeNextLinearIssues) ||
    !Array.isArray(ledger.entries)
  ) {
    throw new Error("Mainline closeout ledger is missing required fields.");
  }

  return ledger as CloseoutLedger;
}

function assertMainCheckout(repoRoot: string, failures: string[]) {
  const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot);
  const githubEventName = process.env.GITHUB_EVENT_NAME;
  const githubBaseRef = process.env.GITHUB_BASE_REF;
  const githubRef = process.env.GITHUB_REF_NAME;
  const effectiveRef = githubRef ?? branch;

  if (githubEventName === "pull_request" && githubBaseRef === "main") {
    return;
  }

  if (effectiveRef !== "main") {
    failures.push(
      `checked-out ref is ${effectiveRef}; run this guard from current main before selecting the next Linear issue.`,
    );
  }
}

function assertRequiredBaselineIssues(
  ledger: CloseoutLedger,
  failures: string[],
) {
  const requiredEntries = new Set(
    ledger.entries
      .filter((entry) => entry.requiredForNextSlice)
      .map((entry) => entry.issueId),
  );

  for (const issueId of requiredBaselineIssues) {
    if (!requiredEntries.has(issueId)) {
      failures.push(`${issueId}: missing required mainline closeout entry.`);
    }
  }
}

function validateEntryShape(entry: CloseoutEntry, failures: string[]) {
  if (!/^OVE-\d+$/.test(entry.issueId)) {
    failures.push(`${entry.issueId}: issueId must look like OVE-123.`);
  }

  if (!entry.title.trim()) {
    failures.push(`${entry.issueId}: title is required.`);
  }

  if (!["done_on_main", "done_on_deployed_commit"].includes(entry.status)) {
    failures.push(`${entry.issueId}: unsupported status ${entry.status}.`);
  }

  if (!entry.linearUrl.startsWith("https://linear.app/overgarden/issue/")) {
    failures.push(`${entry.issueId}: linearUrl must point to Linear.`);
  }

  if (
    !entry.ciRunUrl.startsWith(
      "https://github.com/yehor-design/over.garden/actions/runs/",
    ) &&
    !entry.ciRunUrl.startsWith("https://vercel.com/")
  ) {
    failures.push(
      `${entry.issueId}: ciRunUrl must point to the repo CI run or a Vercel deployment proof URL under Actions budget freeze.`,
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.completedAt)) {
    failures.push(`${entry.issueId}: completedAt must be YYYY-MM-DD.`);
  }

  if (entry.status === "done_on_main") {
    if (!entry.mainCommit || !/^[0-9a-f]{40}$/.test(entry.mainCommit)) {
      failures.push(`${entry.issueId}: mainCommit must be a 40-character SHA.`);
    }

    if (entry.mainRef !== "main") {
      failures.push(`${entry.issueId}: mainRef must be main.`);
    }
  }

  if (entry.verificationCommands.length === 0) {
    failures.push(`${entry.issueId}: verificationCommands must not be empty.`);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
