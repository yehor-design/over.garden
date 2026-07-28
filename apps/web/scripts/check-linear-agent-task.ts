import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const LINEAR_TASK_CONTRACT = "overgarden.linear-sdd.v1";

export const REQUIRED_LINEAR_TASK_HEADINGS = [
  "AI execution directive",
  "Execution metadata",
  "User or operator outcome and behavior",
  "Product thinking and falsification",
  "Pinned baseline, reproduction, evidence, and counterevidence",
  "Root cause or proof gap",
  "Non-negotiable invariants",
  "Exact data, state, protocol, and concurrency contract",
  "Exact vertical scope, target files, and caller inventory",
  "Ordered implementation plan",
  "UX, accessibility, localization, degraded states, performance, and observability",
  "Migration, compatibility, rollout, rollback, and cleanup",
  "Dependencies, ownership boundaries, relations, and non-goals",
  "Measurable acceptance criteria",
  "Required test and fault matrix",
  "Verification commands and required evidence",
  "Delivery, exact-SHA proof, and Linear closeout",
  "Failure gates",
  "Required context",
] as const;

export const OPTIONAL_LINEAR_TASK_HEADING =
  "Open maintainer authorization gates";

const ISSUE_KINDS = new Set([
  "vertical_execution",
  "remediation",
  "operator_execution",
  "decision_spike",
  "canon_correction",
  "coordination_container",
]);

const YES_NO = new Set(["yes", "no"]);
const LOCALE_SCOPES = new Set([
  "shared",
  "ukraine-only",
  "bulgaria",
  "unchanged",
  "not-applicable",
]);
const AUTHORIZATION_STATUSES = new Set(["not_required", "pending", "approved"]);
const PRODUCT_RESEARCH_BRANCHES = new Set(["constrained", "no_direct"]);

const TOUCH_VALUES = new Set([
  "database",
  "repository",
  "server",
  "ui",
  "offline",
  "background-job",
  "search",
  "media",
  "auth",
  "analytics",
  "infrastructure",
  "deployment",
  "coordination",
  "tests",
  "docs",
]);

const SENSITIVE_VALUES = new Set([
  "none",
  "user-data",
  "precise-location",
  "media-originals",
  "auth",
  "public-search",
  "secrets",
  "external-effects",
]);

const EXECUTION_KINDS = new Set([
  "vertical_execution",
  "remediation",
  "operator_execution",
]);

const CORE_CONTEXT_PATHS = [
  "AGENTS.md",
  "docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md",
  "docs/SDD_VERTICAL_SLICE_ROADMAP.md",
  "docs/MAINLINE_CLOSEOUT.md",
  "docs/TECH_STACK_DECISIONS.md",
  "docs/adr/ADR-0014-agentic-stack-realignment.md",
] as const;

const REPOSITORY_DELIVERY_SEQUENCE =
  "current_main -> preserve_local -> issue_branch -> conventional_commit -> branch_push -> pull_request -> exact_head_checks -> capture_feature_sha -> merge_without_bypass -> fetch_main -> containment -> mainline_closeout -> linear_readback -> done";
const EXTERNAL_STATE_DELIVERY_SEQUENCE =
  "baseline -> no_repository_delta -> environment_identity -> read_only_action -> immutable_receipt -> second_readback -> rollback_result -> cleanup_result -> linear_readback -> done";
const COORDINATION_DELIVERY_SEQUENCE =
  "unassigned -> outside_in_progress -> child_readback -> dag_proof -> children_done -> integration_receipt -> linear_readback -> terminal_closeout";

const EXTERNAL_STATE_DELIVERY_PROSE =
  "Declare no-repository-delta at baseline and create no branch, commit, PR, deployment, or provider effect. Record the exact environment class, official capability response class, immutable redacted receipt, digest, second read-back, zero-effect rollback, session cleanup, and final Linear read-back. Compare the saved-description SHA-256 before Done.";
const TEMPLATE_REPOSITORY_DELIVERY_PROSE =
  'Start from current main on `codex/{{issue-id-lower}}-{{slug}}`. Preserve all unrelated and ignored local files and secrets. Use a Conventional Commit, push, open a PR, and run exact-head checks. Before merge, record `{{OVE###_IMPLEMENTATION_SHA}}=$(git rev-parse HEAD)` exactly once in the redacted closeout receipt. Merge without bypass only after every required check passes. After merge, fetch origin/main, run `git merge-base --is-ancestor "${{OVE###_IMPLEMENTATION_SHA}}" origin/main`, and then run `cd apps/web && pnpm mainline:closeout:check`. Perform the final Linear read-back and compare the saved-description SHA-256 before Done.';
const TEMPLATE_COORDINATION_DELIVERY_PROSE =
  "Remain unassigned and outside In Progress. Create no branch, commit, PR, deployment, implementation, or provider effect. Perform the final Linear read-back of every complete child identifier ({{comma-separated OVE-### child identifiers in dependency-table order}}) and relation, prove the child DAG is acyclic and every child is independently Done, record the integration acceptance receipt, compare the saved-description SHA-256, and move the container through direct terminal closeout.";
function coordinationDeliveryProse(childIds: string[]) {
  return `Remain unassigned and outside In Progress. Create no branch, commit, PR, deployment, implementation, or provider effect. Perform the final Linear read-back of every complete child identifier (${childIds.join(", ")}) and relation, prove the child DAG is acyclic and every child is independently Done, record the integration acceptance receipt, compare the saved-description SHA-256, and move the container through direct terminal closeout.`;
}

function repositoryDeliveryProse(branch: string, shaVariable: string) {
  return `Start from current main on \`${branch}\`. Preserve all unrelated and ignored local files and secrets. Use a Conventional Commit, push, open a PR, and run exact-head checks. Before merge, record \`${shaVariable}=$(git rev-parse HEAD)\` exactly once in the redacted closeout receipt. Merge without bypass only after every required check passes. After merge, fetch origin/main, run \`git merge-base --is-ancestor "$${shaVariable}" origin/main\`, and then run \`cd apps/web && pnpm mainline:closeout:check\`. Perform the final Linear read-back and compare the saved-description SHA-256 before Done.`;
}

export const DEFAULT_LINEAR_TASK_REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const VAGUE_FINAL_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/\bTODO\b/i, "TODO"],
  [/\bTBD\b/i, "TBD"],
  [/\bTBC\b/i, "TBC"],
  [/\bFIXME\b/i, "FIXME"],
  [/\bas needed\b/i, "as needed"],
  [/\bfollow (?:the )?existing pattern\b/i, "follow existing pattern"],
  [/\bhandle edge cases\b/i, "handle edge cases"],
  [/\bchoose an owner\b/i, "choose an owner"],
  [/\bfinal name\b/i, "final name"],
  [/\brelevant files\b/i, "relevant files"],
  [/\betc\.?(?:\s|$)/i, "etc."],
];

export type LinearTaskValidationPhase = "template" | "final";

export type LinearTaskValidationFinding = {
  code: string;
  message: string;
};

export type LinearTaskValidationReport = {
  contract: typeof LINEAR_TASK_CONTRACT;
  phase: LinearTaskValidationPhase;
  valid: boolean;
  sha256: string;
  errors: LinearTaskValidationFinding[];
  warnings: LinearTaskValidationFinding[];
};

export type LinearTaskValidationOptions = {
  phase?: LinearTaskValidationPhase;
  repoRoot?: string;
  checkRepositoryEvidence?: boolean;
  checkRepositoryPathsAtBaseline?: boolean;
  expectedSha256?: string;
};

type ParsedTask = {
  headings: string[];
  sections: Map<string, string>;
  metadata: Map<string, string>;
  metadataKeys: string[];
};

export function validateLinearAgentTask(
  source: string,
  options: LinearTaskValidationOptions = {},
): LinearTaskValidationReport {
  const phase = options.phase ?? "final";
  const errors: LinearTaskValidationFinding[] = [];
  const warnings: LinearTaskValidationFinding[] = [];
  const normalized = normalizeLinearMarkup(source.replace(/\r\n?/g, "\n"));
  const parsed = parseTask(normalized);
  const sha256 = createHash("sha256").update(source, "utf8").digest("hex");

  validateHeadingContract(parsed, errors);
  validateBalancedCodeFences(normalized, errors);
  validateRequiredSectionOperativity(parsed, errors);
  validateRawHtmlBlockContract(normalized, errors);
  validateHiddenMarkdownContract(normalized, errors);
  validateMetadata(parsed, phase, errors);

  if (phase === "template") {
    validateTemplateContract(parsed, errors);
  } else {
    validateFinalContract(normalized, parsed, options, errors);
  }

  if (options.expectedSha256) {
    if (!/^[0-9a-f]{64}$/.test(options.expectedSha256)) {
      addFinding(
        errors,
        "expected_sha256_invalid",
        "Expected read-back SHA-256 must be 64 lowercase hexadecimal characters.",
      );
    } else if (sha256 !== options.expectedSha256) {
      addFinding(
        errors,
        "readback_digest_mismatch",
        `Read-back SHA-256 ${sha256} differs from validated pre-write SHA-256 ${options.expectedSha256}.`,
      );
    }
  }

  if (normalized.length > 50_000) {
    addFinding(
      warnings,
      "large_description",
      "The description exceeds 50,000 characters; remove repetition without weakening task-local decisions.",
    );
  }

  return {
    contract: LINEAR_TASK_CONTRACT,
    phase,
    valid: errors.length === 0,
    sha256,
    errors,
    warnings,
  };
}

/**
 * Linear rewrites a saved description before it can be read back: `-` list
 * markers become `*`, and every issue mention is wrapped in an `<issue>` tag.
 * Both defeat this validator — structured-field matchers are anchored on `-`,
 * and the tags read as angle-token placeholders — so a contract validated
 * locally would fail its own Linear read-back and the closeout digest gate
 * could never pass. Normalize both back to their authored form outside fenced
 * code. The reported sha256 still digests the untouched source.
 */
function normalizeLinearMarkup(source: string): string {
  let insideFence = false;

  return source
    .split("\n")
    .map((line) => {
      if (/^\s{0,3}(?:```|~~~)/.test(line)) {
        insideFence = !insideFence;
        return line;
      }
      if (insideFence) return line;
      return line
        .replace(/<issue\b[^>]*>([^<]*)<\/issue>/g, "$1")
        .replace(/^( {0,3})[*+](\s+)/, "$1-$2");
    })
    .join("\n");
}

function parseTask(source: string): ParsedTask {
  const matches = findTopLevelHeadings(source);
  const headings = matches.map((match) => match.heading);
  const sections = new Map<string, string>();

  for (const [index, match] of matches.entries()) {
    const heading = match.heading;

    const bodyStart = match.end;
    const bodyEnd = matches[index + 1]?.start ?? source.length;
    if (!sections.has(heading)) {
      sections.set(heading, source.slice(bodyStart, bodyEnd).trim());
    }
  }

  const metadata = new Map<string, string>();
  const metadataKeys: string[] = [];
  const metadataBody = semanticMarkdownText(
    sections.get("Execution metadata") ?? "",
  );
  for (const match of metadataBody.matchAll(/^- ([^:\n]+):\s*(.+)$/gm)) {
    const key = match[1]?.trim();
    const value = match[2]?.trim();
    if (key && value) {
      metadataKeys.push(key);
      metadata.set(key, unwrapBackticks(value));
    }
  }

  return { headings, sections, metadata, metadataKeys };
}

function findTopLevelHeadings(source: string): Array<{
  heading: string;
  start: number;
  end: number;
}> {
  const matches: Array<{ heading: string; start: number; end: number }> = [];
  for (const line of scanMarkdown(source).lines) {
    if (!line.insideFence && !line.isFence) {
      const heading = line.text.match(/^ {0,3}# ([^\n]+)$/)?.[1]?.trim();
      if (heading) {
        matches.push({
          heading,
          start: line.start,
          end: line.start + line.text.length,
        });
      }
    }
  }

  return matches;
}

type MarkdownLine = {
  text: string;
  start: number;
  insideFence: boolean;
  isFence: boolean;
  fenceInfo?: string;
};

function scanMarkdown(source: string): {
  lines: MarkdownLine[];
  unclosedFence?: { marker: "`" | "~"; length: number };
} {
  const lines: MarkdownLine[] = [];
  let offset = 0;
  let openFence: { marker: "`" | "~"; length: number } | undefined;

  for (const text of source.split("\n")) {
    const fenceMatch = text.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    let isFence = false;
    let fenceInfo: string | undefined;
    let openedThisLine = false;

    if (!openFence && fenceMatch) {
      const run = fenceMatch[1] ?? "";
      const marker = run[0] as "`" | "~";
      const info = (fenceMatch[2] ?? "").trim();
      if (!(marker === "`" && info.includes("`"))) {
        openFence = { marker, length: run.length };
        isFence = true;
        fenceInfo = info;
        openedThisLine = true;
      }
    } else if (openFence && fenceMatch) {
      const run = fenceMatch[1] ?? "";
      const trailing = fenceMatch[2] ?? "";
      if (
        run[0] === openFence.marker &&
        run.length >= openFence.length &&
        /^\s*$/.test(trailing)
      ) {
        isFence = true;
      }
    }

    const insideFence = Boolean(openFence) && !isFence;
    lines.push({ text, start: offset, insideFence, isFence, fenceInfo });

    if (
      isFence &&
      !openedThisLine &&
      openFence &&
      fenceMatch?.[1]?.[0] === openFence.marker &&
      fenceMatch[1].length >= openFence.length &&
      /^\s*$/.test(fenceMatch[2] ?? "")
    ) {
      openFence = undefined;
    }
    offset += text.length + 1;
  }

  return { lines, unclosedFence: openFence };
}

function validateRequiredSectionOperativity(
  parsed: ParsedTask,
  errors: LinearTaskValidationFinding[],
) {
  for (const heading of [
    ...REQUIRED_LINEAR_TASK_HEADINGS,
    ...(parsed.sections.has(OPTIONAL_LINEAR_TASK_HEADING)
      ? [OPTIONAL_LINEAR_TASK_HEADING]
      : []),
  ]) {
    const body = parsed.sections.get(heading) ?? "";
    const lines = scanMarkdown(body).lines;
    const allowsFencedCommands =
      heading === "Verification commands and required evidence";
    const hasStruckDirective = containsGfmStrikethrough(
      markdownOutsideFences(body),
    );
    const hasNonOperativeDirective = lines.some(
      (line) =>
        (!allowsFencedCommands && (line.insideFence || line.isFence)) ||
        /^ {4,}\S/.test(line.text) ||
        /^ {0,3}>/.test(line.text) ||
        (!line.insideFence &&
          !line.isFence &&
          (isRawHtmlBlockStart(line.text) ||
            isLinkReferenceDefinition(line.text))),
    );
    const semanticBody = semanticMarkdownText(body).trim();
    if (
      hasNonOperativeDirective ||
      hasStruckDirective ||
      semanticBody.length < 20
    ) {
      addFinding(
        errors,
        "section_operativity",
        `${heading} must contain substantive operative Markdown outside fences, indented code, blockquotes, raw HTML blocks, link-reference definitions, and strikethrough; only Verification commands may contain fenced command blocks.`,
      );
    }
  }
}

function validateRawHtmlBlockContract(
  source: string,
  errors: LinearTaskValidationFinding[],
) {
  if (
    scanMarkdown(source).lines.some(
      (line) =>
        !line.insideFence && !line.isFence && isRawHtmlBlockStart(line.text),
    )
  ) {
    addFinding(
      errors,
      "raw_html_block",
      "Linear task descriptions must not use CommonMark raw-HTML/comment/processing/CDATA blocks, including generic and custom-element tag blocks; they can hide headings or directives from rendered Markdown.",
    );
  }
}

function validateHiddenMarkdownContract(
  source: string,
  errors: LinearTaskValidationFinding[],
) {
  const operativeLines = scanMarkdown(source).lines.filter(
    (line) => !line.insideFence && !line.isFence,
  );
  if (operativeLines.some((line) => isLinkReferenceDefinition(line.text))) {
    addFinding(
      errors,
      "link_reference_definition",
      "Linear task descriptions must not use link-reference definition lines outside fenced verification commands; definitions render invisibly and cannot carry directives or evidence.",
    );
  }
  if (containsGfmStrikethrough(markdownOutsideFences(source))) {
    addFinding(
      errors,
      "gfm_strikethrough",
      "Linear task descriptions must not use GFM strikethrough outside fenced verification commands; struck content is non-operative and cannot carry directives or evidence.",
    );
  }
}

function isRawHtmlBlockStart(text: string) {
  const commonMarkTypeOneToSix =
    /^ {0,3}(?:<!--|<\?|<!\[CDATA\[|<![A-Z]|<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|pre|script|search|section|style|summary|table|tbody|td|textarea|tfoot|th|thead|title|tr|track|ul)(?:\s|>|\/))/i;
  const genericTagOnOwnLine =
    /^ {0,3}(?:<[A-Za-z][A-Za-z0-9-]*(?:[ \t]+[A-Za-z_:][A-Za-z0-9_.:-]*(?:[ \t]*=[ \t]*(?:[^ "'=<>`]+|'[^']*'|"[^"]*"))?)*[ \t]*\/?>|<\/[A-Za-z][A-Za-z0-9-]*[ \t]*>)[ \t]*$/;
  return commonMarkTypeOneToSix.test(text) || genericTagOnOwnLine.test(text);
}

function isLinkReferenceDefinition(text: string) {
  return /^ {0,3}\[(?:\\[^\n]|[^\[\]\\\n])+\]:[ \t]*(?:\S.*)?$/.test(text);
}

function gfmStrikethroughRanges(text: string): Array<[number, number]> {
  const syntaxSurface = maskInlineCodeAndEscapes(text);
  const ranges: Array<[number, number]> = [];
  const pattern = /~~(?=\S)(?:(?!~~|\n[ \t]*\n)[\s\S])*?(?<=\S)~~/g;
  for (const match of syntaxSurface.matchAll(pattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (syntaxSurface[start - 1] === "~" || syntaxSurface[end] === "~") {
      continue;
    }
    ranges.push([start, end]);
  }
  return ranges;
}

function maskInlineCodeAndEscapes(text: string) {
  const characters = text.split("");
  for (let index = 0; index < characters.length; index += 1) {
    if (characters[index] === "\\" && index + 1 < characters.length) {
      characters[index] = " ";
      characters[index + 1] = " ";
      index += 1;
      continue;
    }
    if (characters[index] !== "`") continue;
    let runLength = 1;
    while (characters[index + runLength] === "`") runLength += 1;
    const closingIndex = findMatchingBacktickRun(
      text,
      index + runLength,
      runLength,
    );
    if (closingIndex < 0) {
      index += runLength - 1;
      continue;
    }
    for (
      let maskedIndex = index;
      maskedIndex < closingIndex + runLength;
      maskedIndex += 1
    ) {
      characters[maskedIndex] = "x";
    }
    index = closingIndex + runLength - 1;
  }
  return characters.join("");
}

function findMatchingBacktickRun(
  text: string,
  searchStart: number,
  expectedLength: number,
) {
  for (let index = searchStart; index < text.length; index += 1) {
    if (text[index] !== "`") continue;
    let runLength = 1;
    while (text[index + runLength] === "`") runLength += 1;
    if (runLength === expectedLength) return index;
    index += runLength - 1;
  }
  return -1;
}

function containsGfmStrikethrough(text: string) {
  return gfmStrikethroughRanges(text).length > 0;
}

function markdownOutsideFences(source: string) {
  return scanMarkdown(source)
    .lines.filter((line) => !line.insideFence && !line.isFence)
    .map((line) => line.text)
    .join("\n");
}

function removeGfmStrikethrough(text: string) {
  const characters = text.split("");
  for (const [start, end] of gfmStrikethroughRanges(text)) {
    for (let index = start; index < end; index += 1) {
      characters[index] = " ";
    }
  }
  return characters.join("");
}

function semanticMarkdownText(source: string) {
  const withoutClosedHtmlCodeBlocks = source.replace(
    /<([A-Za-z][A-Za-z0-9-]*)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    "",
  );
  const withoutHtmlCodeBlocks = withoutClosedHtmlCodeBlocks.replace(
    /<[A-Za-z][A-Za-z0-9-]*\b[^>]*>[\s\S]*$/gi,
    "",
  );
  const operativeText = scanMarkdown(withoutHtmlCodeBlocks)
    .lines.filter(
      (line) =>
        !line.insideFence &&
        !line.isFence &&
        !/^ {4,}\S/.test(line.text) &&
        !/^ {0,3}>/.test(line.text) &&
        !isRawHtmlBlockStart(line.text) &&
        !isLinkReferenceDefinition(line.text),
    )
    .map((line) => line.text)
    .join("\n");
  return removeGfmStrikethrough(operativeText);
}

function affirmativeContractText(source: string) {
  return semanticMarkdownText(source)
    .split(/[;\n]+|(?<=\.)\s+(?=[A-Z])/)
    .filter(
      (clause) =>
        !/\b(?:stop on|stop if|forbid(?:s|den)?|prohibit(?:s|ed)?|must not|may not|cannot permit|reject(?:s|ed)?|invalidates?|failure gates?|blocks? (?:execution|closeout|rollout|selection))\b/i.test(
          clause,
        ),
    )
    .join("\n");
}

function validateHeadingContract(
  parsed: ParsedTask,
  errors: LinearTaskValidationFinding[],
) {
  const allowed = [
    ...REQUIRED_LINEAR_TASK_HEADINGS,
    OPTIONAL_LINEAR_TASK_HEADING,
  ];
  const expectedWithoutOptional = [...REQUIRED_LINEAR_TASK_HEADINGS];
  const expectedWithOptional = [...allowed];

  if (
    !arraysEqual(parsed.headings, expectedWithoutOptional) &&
    !arraysEqual(parsed.headings, expectedWithOptional)
  ) {
    addFinding(
      errors,
      "heading_contract",
      `Use the exact ordered H1 headings from the template; only \"${OPTIONAL_LINEAR_TASK_HEADING}\" may be appended conditionally.`,
    );
  }

  for (const heading of REQUIRED_LINEAR_TASK_HEADINGS) {
    const count = parsed.headings.filter(
      (candidate) => candidate === heading,
    ).length;
    if (count !== 1) {
      addFinding(
        errors,
        "heading_presence",
        `Required heading \"${heading}\" must appear exactly once (found ${count}).`,
      );
      continue;
    }

    if (!parsed.sections.get(heading)?.trim()) {
      addFinding(
        errors,
        "empty_section",
        `Section \"${heading}\" must contain a task-specific contract.`,
      );
    }
  }

  const optionalCount = parsed.headings.filter(
    (candidate) => candidate === OPTIONAL_LINEAR_TASK_HEADING,
  ).length;
  if (optionalCount > 1) {
    addFinding(
      errors,
      "optional_heading_duplicate",
      `Optional heading \"${OPTIONAL_LINEAR_TASK_HEADING}\" may appear at most once.`,
    );
  }
  if (
    optionalCount === 1 &&
    !parsed.sections.get(OPTIONAL_LINEAR_TASK_HEADING)?.trim()
  ) {
    addFinding(
      errors,
      "empty_authorization_gate",
      `Section \"${OPTIONAL_LINEAR_TASK_HEADING}\" must define the exact approval contract or be removed.`,
    );
  }
}

function validateTemplateContract(
  parsed: ParsedTask,
  errors: LinearTaskValidationFinding[],
) {
  const sectionMarkers: Record<
    (typeof REQUIRED_LINEAR_TASK_HEADINGS)[number],
    string[]
  > = {
    "AI execution directive": ["authorizes", "{{"],
    "Execution metadata": ["Issue identifier", "Repository change", "{{"],
    "User or operator outcome and behavior": [
      "Happy path",
      "Degraded path",
      "Recovery path",
      "Final read-back",
      "{{",
    ],
    "Product thinking and falsification": [
      "Product-research branch",
      "Load-bearing assumption",
      "Falsification signal",
      "{{",
    ],
    "Pinned baseline, reproduction, evidence, and counterevidence": [
      "Safe reproduction",
      "Confirmed evidence",
      "Counterevidence",
      "Not proved",
      "{{",
    ],
    "Root cause or proof gap": [
      "closest failing boundary",
      "bounded investigation",
      "stop condition",
      "{{",
    ],
    "Non-negotiable invariants": ["INV-01", "INV-06", "{{"],
    "Exact data, state, protocol, and concurrency contract": [
      "Idempotency",
      "Concurrency",
      "External effects",
      "{{",
    ],
    "Exact vertical scope, target files, and caller inventory": [
      "Layer/surface",
      "Caller/sibling/consumer inventory",
      "{{",
    ],
    "Ordered implementation plan": [
      "current `main`",
      "regression",
      "approval gates",
      "exact-SHA",
      "Linear read-back",
      "{{",
    ],
    "UX, accessibility, localization, degraded states, performance, and observability":
      [
        "Locale matrix",
        "Accessibility",
        "Performance budget",
        "Performance measurement",
        " at `{{",
        "Blocking alerts: forbidden",
        "Global wait overlay: forbidden",
        "Pointer trap: forbidden",
        "Unbounded polling/retry: forbidden",
        "Wait-safe controls",
        "Slow/down proof",
        "Observability",
        "{{",
      ],
    "Migration, compatibility, rollout, rollback, and cleanup": [
      "Expand",
      "Legacy/backfill",
      "Compatibility",
      "Rollout",
      "Rollback",
      "Cleanup/retention",
      "{{",
    ],
    "Dependencies, ownership boundaries, relations, and non-goals": [
      "Blocked by",
      "Acyclic execution order",
      "Canonical owners",
      "Child issue",
      "Integration criterion",
      "DAG proof",
      "{{",
    ],
    "Measurable acceptance criteria": [
      "AC-01",
      "AC-08",
      "Protects",
      "Verified by",
      "{{",
    ],
    "Required test and fault matrix": [
      "Protects",
      "Proves",
      "Verification",
      "Fault/input",
      "Happy path",
      "Authorization/another owner",
      "Concurrent race",
      "Timeout/crash/partial success",
      "Load/resource budget",
      "{{",
    ],
    "Verification commands and required evidence": [
      "VER-01",
      "VER-05",
      "Command status",
      "Expected receipt",
      "Performance proof: PERF-01",
      "No-wedge proof: WAIT-01",
      "{{",
    ],
    "Delivery, exact-SHA proof, and Linear closeout": [
      "Repository-change path",
      "External-state-only operator path",
      "Coordination-container path",
      "Delivery path",
      "Delivery sequence",
      "SHA-256",
      "{{",
    ],
    "Failure gates": ["Do not start", "{{"],
    "Required context": [
      "Repository authority",
      "Linear and external context",
      "{{",
    ],
  };

  for (const heading of REQUIRED_LINEAR_TASK_HEADINGS) {
    const body = parsed.sections.get(heading) ?? "";
    if (!body.includes("{{")) {
      addFinding(
        errors,
        "template_section_placeholders",
        `Tracked template section \"${heading}\" must retain task-specific placeholders.`,
      );
    }
    for (const marker of sectionMarkers[heading]) {
      if (!body.includes(marker)) {
        addFinding(
          errors,
          "template_section_marker",
          `Tracked template section \"${heading}\" is missing required skeleton marker \"${marker}\".`,
        );
      }
    }
  }

  const templateProductThinking =
    parsed.sections.get("Product thinking and falsification") ?? "";
  const templateUx =
    parsed.sections.get(
      "UX, accessibility, localization, degraded states, performance, and observability",
    ) ?? "";
  const templateVerification =
    parsed.sections.get("Verification commands and required evidence") ?? "";
  const templateDelivery =
    parsed.sections.get("Delivery, exact-SHA proof, and Linear closeout") ?? "";
  const templateRequiredContext = parsed.sections.get("Required context") ?? "";
  const templateVerificationBlocks = parseIdBlocks(templateVerification, "VER");
  const templateVer03 = templateVerificationBlocks.find(
    (block) => block.id === "VER-03",
  )?.body;
  const normalizedProductResearchContract =
    `${templateProductThinking}\n${templateRequiredContext}`
      .replace(/\s+/g, " ")
      .trim();
  const normalizedTemplateDelivery = templateDelivery
    .replace(/\s+/g, " ")
    .trim();
  const normalizedTemplatePerformanceAndWait =
    `${templateUx}\n${templateVerification}`.replace(/\s+/g, " ").trim();
  const hasDeferredNoDirectResearch =
    /\bno[-_ ]direct\b[^.]{0,120}\b(?:provisional|tentative|deferred)\b/i.test(
      normalizedProductResearchContract,
    ) ||
    /\b(?:provisional|tentative|deferred)\b[^.]{0,120}\bno[-_ ]direct\b/i.test(
      normalizedProductResearchContract,
    ) ||
    /\b(?:agent|implementer)\b[^.]{0,120}\b(?:choose|select|audit|add|use|cite)\b[^.]{0,80}\bresearch\b[^.]{0,80}\b(?:later|during (?:coding|implementation|execution))\b/i.test(
      normalizedProductResearchContract,
    );
  const hasLowerBoundPerformancePolarity =
    /\b(?:PERF-01|performance (?:budget|metric|target))\b[^.]{0,180}\b(?:at least|no less than|minimum(?: of)?)\b/i.test(
      normalizedTemplatePerformanceAndWait,
    ) ||
    /\b(?:at least|no less than|minimum(?: of)?)\b[^.]{0,180}\b(?:PERF-01|performance (?:budget|metric|target))\b/i.test(
      normalizedTemplatePerformanceAndWait,
    );
  const hasFakePerformanceInstrument =
    /\b(?:dummy|fake|placeholder|invented)\b[^.]{0,100}\b(?:instrument|timer|probe|histogram|benchmark|test)\b/i.test(
      normalizedTemplatePerformanceAndWait,
    ) ||
    /\b(?:instrument|timer|probe|histogram|benchmark|test)\b[^.]{0,100}\b(?:dummy|fake|placeholder|invented)\b/i.test(
      normalizedTemplatePerformanceAndWait,
    );
  const hasDisableableWaitControls =
    /\b(?:wait-safe controls?|same first control|same second control|both controls?)\b[^.]{0,180}\b(?:may|can|allowed to|optionally)\b[^.]{0,80}\b(?:disabled|unusable|unresponsive|blocked|hidden)\b/i.test(
      normalizedTemplatePerformanceAndWait,
    );
  const hasDisableableWaitProof =
    /\b(?:WAIT-01|slow\/down proof|no-wedge proof)\b[^.]{0,260}\b(?:may|can|allowed to|optionally)\b[^.]{0,100}\b(?:disable|disabled|block|blocked|trap|trapped|hide|hidden|unresponsive|unusable)\b/i.test(
      normalizedTemplatePerformanceAndWait,
    );
  const hasAllowedDirectMainMutation =
    /\bdirect (?:main|origin\/main) mutation\b[^.]{0,100}\b(?:allowed|permitted|optional)\b/i.test(
      normalizedTemplateDelivery,
    ) ||
    /\b(?:allow|permit|may|can)\b[^.]{0,100}\bdirect\b[^.]{0,60}\b(?:main|origin\/main)\b[^.]{0,60}\b(?:mutation|push|commit)\b/i.test(
      normalizedTemplateDelivery,
    );
  const hasOptionalLocalStatePreservation =
    /\blocal state preservation\b[^.]{0,100}\b(?:optional|recommended|best effort|when possible)\b/i.test(
      normalizedTemplateDelivery,
    ) ||
    /\bpreserv(?:e|ation)\b[^.]{0,100}\b(?:unrelated|ignored|local state)\b[^.]{0,100}\b(?:optional|recommended|best effort|when possible)\b/i.test(
      normalizedTemplateDelivery,
    );
  const hasDestructiveOrStaleDeliveryInstruction =
    /\b(?:start|base|continue|work)\b[^.]{0,80}\b(?:stale|outdated|old)\s+(?:origin\/)?main\b/i.test(
      normalizedTemplateDelivery,
    ) ||
    /\b(?:delete|discard|remove|overwrite|reset|clean)\b[^.]{0,100}\b(?:unrelated|ignored)\b[^.]{0,80}\b(?:local (?:files|state|changes)|files|changes|secrets?)\b/i.test(
      normalizedTemplateDelivery,
    );
  const operativeTemplateDeliveryLines = scanMarkdown(
    semanticMarkdownText(templateDelivery),
  ).lines.filter((line) => !line.insideFence && !line.isFence);
  const canonicalRepositorySequenceLine = `Canonical repository-change sequence: \`${REPOSITORY_DELIVERY_SEQUENCE}\`.`;
  const canonicalExternalStateSequenceLine = `Canonical external-state-only sequence: \`${EXTERNAL_STATE_DELIVERY_SEQUENCE}\`.`;
  const canonicalCoordinationSequenceLine = `Canonical coordination-container sequence: \`${COORDINATION_DELIVERY_SEQUENCE}\`.`;
  const exactTemplateChecks: Array<[boolean, string]> = [
    [
      arraysEqual(
        getStructuredFieldValues(
          templateProductThinking,
          "Product-research branch",
        ),
        ["{{constrained|no_direct}}"],
      ),
      "the exact structured Product-research branch enum",
    ],
    [
      normalizedProductResearchContract.includes(
        "record a closed affirmative no-direct-research conclusion with zero research paths and no open/not-ruled-out uncertainty",
      ) &&
        normalizedProductResearchContract.includes(
          "use a specific no-direct-research conclusion with zero paths",
        ) &&
        !hasDeferredNoDirectResearch,
      "a closed no_direct research conclusion with no deferred agent choice",
    ],
    [
      arraysEqual(getStructuredFieldValues(templateUx, "Performance budget"), [
        "PERF-01 (`{{canonical_metric_key}}`) — `{{same canonical_metric_key}}` is at most {{one number}} {{one compatible unit}}{{optional exact suffix: and cancellation fences/rejects/stops/prevents late completion/response/writes/evidence admission/relation state}}.",
      ]) && !hasLowerBoundPerformancePolarity,
      "one exact upper-bound PERF-01 Performance budget field",
    ],
    [
      arraysEqual(
        getStructuredFieldValues(templateUx, "Performance measurement"),
        [
          "PERF-01 (`{{same canonical_metric_key}}`) — VER-{{NN}} uses the {{one real timer/probe/histogram/benchmark/test}} at `{{exact command token, test path, selector, endpoint, or connector target repeated in that VER command}}` to measure `{{same canonical_metric_key}}`.",
        ],
      ) && !hasFakePerformanceInstrument,
      "one exact real-instrument PERF-01 Performance measurement with an exact target",
    ],
    [
      arraysEqual(getStructuredFieldValues(templateUx, "Wait-safe controls"), [
        "`{{first concrete control}}`; `{{second concrete control}}` — both remain usable and enabled during every wait.",
      ]) && !hasDisableableWaitControls,
      "one exact always-enabled Wait-safe controls contract",
    ],
    [
      arraysEqual(getStructuredFieldValues(templateUx, "Slow/down proof"), [
        "WAIT-01 — VER-{{NN}} at `{{same exact executable/read-back target}}` — injected `{{concrete domain-specific slow/timeout/down fault}}` asserts `{{same first control}}` and `{{same second control}}` remain responsive and records a bounded `{{recovery|retry|inconclusive|drift recovery|unstarted|failed|cancelled|timed out|available|degraded|restored|rolled back|completed}}` receipt.",
      ]) && !hasDisableableWaitProof,
      "one exact WAIT-01 proof that keeps both controls responsive",
    ],
    [
      arraysEqual(
        getStructuredFieldValues(templateVerification, "Performance proof"),
        [
          "PERF-01 (`{{same canonical_metric_key}}`) — target `{{same exact executable/read-back target}}` measures `{{same canonical_metric_key}}` at most {{same number}} {{same unit}} and records a bounded threshold receipt.",
        ],
      ) &&
        Boolean(templateVer03) &&
        arraysEqual(
          getStructuredFieldValues(templateVer03 ?? "", "Performance proof"),
          [
            "PERF-01 (`{{same canonical_metric_key}}`) — target `{{same exact executable/read-back target}}` measures `{{same canonical_metric_key}}` at most {{same number}} {{same unit}} and records a bounded threshold receipt.",
          ],
        ),
      "one exact PERF-01 proof in VER-03 with the same metric, target, threshold, and unit placeholders",
    ],
    [
      arraysEqual(
        getStructuredFieldValues(templateVerification, "No-wedge proof"),
        [
          "WAIT-01 — target `{{same exact executable/read-back target}}` injects `{{same concrete fault}}`, proves `{{same first control}}` and `{{same second control}}` remain responsive, and records a bounded `{{same concrete recovery state}}` receipt.",
        ],
      ) &&
        Boolean(templateVer03) &&
        arraysEqual(
          getStructuredFieldValues(templateVer03 ?? "", "No-wedge proof"),
          [
            "WAIT-01 — target `{{same exact executable/read-back target}}` injects `{{same concrete fault}}`, proves `{{same first control}}` and `{{same second control}}` remain responsive, and records a bounded `{{same concrete recovery state}}` receipt.",
          ],
        ),
      "one exact WAIT-01 proof in VER-03 with the same target, fault, controls, and recovery-state placeholders",
    ],
    [
      arraysEqual(getStructuredFieldValues(templateDelivery, "Delivery path"), [
        "{{repository_change|external_state_only|coordination_container}}",
      ]),
      "one structured Delivery path selector",
    ],
    [
      arraysEqual(
        getStructuredFieldValues(templateDelivery, "Delivery sequence"),
        [
          "{{copy exactly one matching canonical sequence below and delete the two inapplicable paths}}",
        ],
      ),
      "one exact closed Delivery sequence selector",
    ],
    [
      arraysEqual(
        operativeTemplateDeliveryLines
          .map((line) => line.text.trim())
          .filter((line) =>
            line.startsWith("Canonical repository-change sequence:"),
          ),
        [canonicalRepositorySequenceLine],
      ) &&
        arraysEqual(
          operativeTemplateDeliveryLines
            .map((line) => line.text.trim())
            .filter((line) =>
              line.startsWith("Canonical external-state-only sequence:"),
            ),
          [canonicalExternalStateSequenceLine],
        ) &&
        arraysEqual(
          operativeTemplateDeliveryLines
            .map((line) => line.text.trim())
            .filter((line) =>
              line.startsWith("Canonical coordination-container sequence:"),
            ),
          [canonicalCoordinationSequenceLine],
        ),
      "exactly one operative copy of each canonical delivery sequence and no labeled alternative",
    ],
    [
      arraysEqual(
        getStructuredFieldValues(templateDelivery, "Direct main mutation"),
        ["{{forbidden for repository_change; otherwise delete this field}}"],
      ) && !hasAllowedDirectMainMutation,
      "the exact forbidden Direct main mutation field",
    ],
    [
      arraysEqual(
        getStructuredFieldValues(templateDelivery, "Local state preservation"),
        ["{{required for repository_change; otherwise delete this field}}"],
      ) && !hasOptionalLocalStatePreservation,
      "the exact required Local state preservation field",
    ],
    [
      normalizedTemplateDelivery.includes(TEMPLATE_REPOSITORY_DELIVERY_PROSE) &&
        !hasDestructiveOrStaleDeliveryInstruction,
      "the exact repository-change copy-ready delivery paragraph",
    ],
    [
      normalizedTemplateDelivery.includes(EXTERNAL_STATE_DELIVERY_PROSE),
      "the exact external-state-only copy-ready delivery paragraph",
    ],
    [
      normalizedTemplateDelivery.includes(TEMPLATE_COORDINATION_DELIVERY_PROSE),
      "the exact coordination-container copy-ready delivery paragraph",
    ],
  ];
  for (const [valid, label] of exactTemplateChecks) {
    if (!valid) {
      addFinding(
        errors,
        "template_exact_contract",
        `Tracked template must retain ${label}.`,
      );
    }
  }

  const templateVer05 = templateVerificationBlocks.find(
    (block) => block.id === "VER-05",
  )?.body;
  const templateVer05BashBlocks = templateVer05
    ? extractFencedCodeBlocks(templateVer05).filter(
        (block) => block.info === "bash",
      )
    : [];
  const templateVer05CommandLines = templateVer05BashBlocks.flatMap((block) =>
    block.content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#")),
  );
  const expectedTemplateVer05Commands = [
    "git fetch origin main",
    'git merge-base --is-ancestor "${{TASK_PREFIX}}_IMPLEMENTATION_SHA" origin/main',
    "cd apps/web",
    "pnpm mainline:closeout:check",
  ];
  const templateVer05CommandIndexes = expectedTemplateVer05Commands.map(
    (command) => templateVer05CommandLines.indexOf(command),
  );
  const templateVer05CommandsAreExactAndOrdered =
    templateVer05BashBlocks.length === 1 &&
    expectedTemplateVer05Commands.every(
      (command) =>
        templateVer05CommandLines.filter((line) => line === command).length ===
        1,
    ) &&
    templateVer05CommandIndexes.every(
      (index, position) =>
        index >= 0 &&
        (position === 0 ||
          index > (templateVer05CommandIndexes[position - 1] ?? -1)),
    ) &&
    !templateVer05CommandLines.some(
      (line) =>
        /^git fetch\b/.test(line) && line !== expectedTemplateVer05Commands[0],
    ) &&
    !templateVer05CommandLines.some(
      (line) =>
        /^git merge-base\b/.test(line) &&
        line !== expectedTemplateVer05Commands[1],
    ) &&
    !templateVer05CommandLines.some((line) => /\bgit rev-parse\b/.test(line));
  if (!templateVer05 || !templateVer05CommandsAreExactAndOrdered) {
    addFinding(
      errors,
      "template_delivery_order",
      "VER-05 must contain one bash block whose executable commands use the exact pre-merge `${{TASK_PREFIX}}_IMPLEMENTATION_SHA`, then fetch main, prove containment, enter apps/web, and run mainline closeout in that order; prose decoys, alternate Git commands, duplicates, and post-merge SHA recapture do not count.",
    );
  }

  if (parsed.sections.has(OPTIONAL_LINEAR_TASK_HEADING)) {
    const body = parsed.sections.get(OPTIONAL_LINEAR_TASK_HEADING) ?? "";
    for (const marker of [
      "Authorization status",
      "Required approval artifact",
      "Approval receipt",
      "Work forbidden before approval",
      "{{",
    ]) {
      if (!body.includes(marker)) {
        addFinding(
          errors,
          "template_authorization_marker",
          `Tracked authorization section is missing \"${marker}\".`,
        );
      }
    }
  }
}

function validateBalancedCodeFences(
  source: string,
  errors: LinearTaskValidationFinding[],
) {
  const scan = scanMarkdown(source);
  if (scan.unclosedFence) {
    addFinding(
      errors,
      "unbalanced_code_fences",
      `Markdown code fence ${scan.unclosedFence.marker.repeat(scan.unclosedFence.length)} is not closed with a matching delimiter.`,
    );
  }
}

function validateMetadata(
  parsed: ParsedTask,
  phase: LinearTaskValidationPhase,
  errors: LinearTaskValidationFinding[],
) {
  const requiredKeys = [
    "Contract",
    "Issue identifier",
    "Issue kind",
    "User-facing",
    "Locale scope",
    "Repository change",
    "Live deployment required",
    "Direct production-state mutation",
    "Authorization status",
    "Baseline SHA",
    "Evidence captured",
    "Touches",
    "Sensitive boundaries",
    "External systems",
  ];
  const requiredKeySet = new Set(requiredKeys);

  for (const key of requiredKeys) {
    const count = parsed.metadataKeys.filter(
      (candidate) => candidate === key,
    ).length;
    if (count === 0) {
      addFinding(
        errors,
        "metadata_missing",
        `Execution metadata is missing \"${key}\".`,
      );
    } else if (count > 1) {
      addFinding(
        errors,
        "metadata_duplicate",
        `Execution metadata field \"${key}\" must appear exactly once (found ${count}).`,
      );
    }
  }
  for (const key of parsed.metadataKeys) {
    if (!requiredKeySet.has(key)) {
      addFinding(
        errors,
        "metadata_unknown",
        `Execution metadata contains unsupported field \"${key}\". Store Linear container fields in Linear itself and read them back at closeout.`,
      );
    }
  }

  if (parsed.metadata.get("Contract") !== LINEAR_TASK_CONTRACT) {
    addFinding(
      errors,
      "contract_version",
      `Contract must be \`${LINEAR_TASK_CONTRACT}\`.`,
    );
  }

  if (phase === "template") return;

  validateEnumMetadata(parsed.metadata, "Issue kind", ISSUE_KINDS, errors);
  const issueIdentifier = parsed.metadata.get("Issue identifier") ?? "";
  if (!/^OVE-\d+$/.test(issueIdentifier)) {
    addFinding(
      errors,
      "issue_identifier",
      "Issue identifier must be the concrete Linear identifier in `OVE-###` form after two-pass creation.",
    );
  }
  validateEnumMetadata(parsed.metadata, "User-facing", YES_NO, errors);
  validateEnumMetadata(parsed.metadata, "Locale scope", LOCALE_SCOPES, errors);
  validateEnumMetadata(parsed.metadata, "Repository change", YES_NO, errors);
  validateEnumMetadata(
    parsed.metadata,
    "Live deployment required",
    YES_NO,
    errors,
  );
  validateEnumMetadata(
    parsed.metadata,
    "Direct production-state mutation",
    YES_NO,
    errors,
  );
  validateEnumMetadata(
    parsed.metadata,
    "Authorization status",
    AUTHORIZATION_STATUSES,
    errors,
  );

  const baselineSha = parsed.metadata.get("Baseline SHA") ?? "";
  if (!/^[0-9a-f]{40}$/.test(baselineSha)) {
    addFinding(
      errors,
      "baseline_sha",
      "Baseline SHA must be one concrete 40-character lowercase Git SHA.",
    );
  }

  const evidenceDate = parsed.metadata.get("Evidence captured") ?? "";
  if (!isIsoDate(evidenceDate)) {
    addFinding(
      errors,
      "evidence_date",
      "Evidence captured must be a real calendar date in YYYY-MM-DD form.",
    );
  } else if (`${evidenceDate}T00:00:00.000Z` > new Date().toISOString()) {
    addFinding(
      errors,
      "evidence_date_future",
      "Evidence captured cannot be in the future.",
    );
  }

  const touches = parseCsv(parsed.metadata.get("Touches"));
  validateCsvValues("Touches", touches, TOUCH_VALUES, errors);
  const sensitive = parseCsv(parsed.metadata.get("Sensitive boundaries"));
  validateCsvValues(
    "Sensitive boundaries",
    sensitive,
    SENSITIVE_VALUES,
    errors,
  );
  if (sensitive.includes("none") && sensitive.length > 1) {
    addFinding(
      errors,
      "sensitive_none_mixed",
      "Sensitive boundaries cannot combine `none` with another value.",
    );
  }
  for (const [label, values] of [
    ["Touches", touches],
    ["Sensitive boundaries", sensitive],
  ] as const) {
    if (new Set(values).size !== values.length) {
      addFinding(
        errors,
        "metadata_list_duplicate",
        `${label} must not contain duplicate values.`,
      );
    }
  }

  const externalSystems = parsed.metadata.get("External systems")?.trim();
  if (!externalSystems) {
    addFinding(
      errors,
      "external_systems_empty",
      "External systems must name exact providers or `none`.",
    );
  } else {
    const systems = externalSystems
      .split(",")
      .map((value) => unwrapBackticks(value.trim()))
      .filter(Boolean);
    const genericSystems = new Set([
      "cloud",
      "database",
      "provider",
      "external system",
      "infrastructure",
    ]);
    if (
      systems.length === 0 ||
      (systems.some((value) => value.toLowerCase() === "none") &&
        !(systems.length === 1 && systems[0]?.toLowerCase() === "none")) ||
      systems.some((value) => genericSystems.has(value.toLowerCase()))
    ) {
      addFinding(
        errors,
        "external_systems_value",
        "External systems must be exactly `none` or a comma-separated list of concrete provider/service names without generic placeholders.",
      );
    }
    if (
      new Set(systems.map((value) => value.toLowerCase())).size !==
      systems.length
    ) {
      addFinding(
        errors,
        "external_systems_duplicate",
        "External systems must not contain duplicate provider/service names.",
      );
    }
  }
}

function validateFinalContract(
  source: string,
  parsed: ParsedTask,
  options: LinearTaskValidationOptions,
  errors: LinearTaskValidationFinding[],
) {
  if (containsUnresolvedFinalPlaceholder(source)) {
    addFinding(
      errors,
      "unresolved_placeholder",
      "Final Linear descriptions must not contain brace, angle-token, or recognized square-bracket placeholders; replace them with concrete values or executable runtime capture commands.",
    );
  }
  if (/<!--[\s\S]*?-->/.test(source)) {
    addFinding(
      errors,
      "instructional_comment",
      "Remove template HTML comments before the final Linear write.",
    );
  }
  const prose = proseOnly(source);
  for (const [pattern, label] of VAGUE_FINAL_PATTERNS) {
    if (pattern.test(prose)) {
      addFinding(
        errors,
        "vague_language",
        `Replace open-ended phrase \"${label}\" with an exact decision or a specific Not applicable reason.`,
      );
    }
  }

  const issueKind = parsed.metadata.get("Issue kind") ?? "";
  const issueIdentifier = parsed.metadata.get("Issue identifier") ?? "";
  const touches = parseCsv(parsed.metadata.get("Touches"));
  const sensitive = parseCsv(parsed.metadata.get("Sensitive boundaries"));
  const externalSystems = parsed.metadata.get("External systems")?.trim() ?? "";
  const userFacing = parsed.metadata.get("User-facing") ?? "";
  const localeScope = parsed.metadata.get("Locale scope") ?? "";
  const repositoryChange = parsed.metadata.get("Repository change") ?? "";
  const liveDeployment = parsed.metadata.get("Live deployment required") ?? "";
  const directProductionMutation =
    parsed.metadata.get("Direct production-state mutation") ?? "";
  const authorizationStatus = parsed.metadata.get("Authorization status") ?? "";

  if (EXECUTION_KINDS.has(issueKind) && repositoryChange === "yes") {
    requireValues(touches, ["tests", "docs"], "execution_touches", errors);
  }

  const productLayers = touches.filter(
    (value) => value !== "tests" && value !== "docs",
  );
  if (issueKind === "vertical_execution" && productLayers.length < 3) {
    addFinding(
      errors,
      "vertical_layer_count",
      "A vertical_execution task must declare at least three affected non-test/documentation layers.",
    );
  }
  if (issueKind === "remediation" && productLayers.length < 1) {
    addFinding(
      errors,
      "remediation_boundary",
      "A remediation task must name at least one enforceable production boundary in Touches.",
    );
  }
  if (
    issueKind === "operator_execution" &&
    !productLayers.some((value) =>
      [
        "database",
        "server",
        "background-job",
        "search",
        "media",
        "infrastructure",
        "deployment",
      ].includes(value),
    )
  ) {
    addFinding(
      errors,
      "operator_boundary",
      "An operator_execution task must name its operational boundary in Touches.",
    );
  }

  validateIssueKindCompatibility(parsed, errors);
  validateCommonSemanticContract(parsed, errors);
  validateAcceptanceAndVerification(
    parsed,
    issueKind,
    repositoryChange,
    options,
    errors,
  );
  validateDeliveryContract(
    parsed,
    issueIdentifier,
    issueKind,
    repositoryChange,
    errors,
  );
  validateRequiredContext(parsed, repositoryChange, options, errors);
  validateNotApplicableReasons(source, errors);
  validateHazardousCommands(source, errors);
  validateAuthorizationContract(
    parsed,
    directProductionMutation,
    authorizationStatus,
    errors,
  );

  if (userFacing === "yes") {
    validateUserFacingContract(parsed, source, localeScope, errors);
  }

  const requiresInfrastructureRegistry =
    externalSystems.toLowerCase() !== "none" ||
    touches.some((value) =>
      ["media", "infrastructure", "deployment"].includes(value),
    );
  if (requiresInfrastructureRegistry) {
    requireText(
      source,
      "docs/INFRASTRUCTURE_REGISTRY.md",
      "infrastructure_registry",
      "External/provider/media/deployment work must include docs/INFRASTRUCTURE_REGISTRY.md.",
      errors,
    );
    const externalContract = joinSections(parsed, [
      "Pinned baseline, reproduction, evidence, and counterevidence",
      "Exact data, state, protocol, and concurrency contract",
      "Ordered implementation plan",
      "Migration, compatibility, rollout, rollback, and cleanup",
      "Verification commands and required evidence",
    ]);
    requirePositiveTerms(
      externalContract,
      ["official", "capability", "idempotent", "read-back", "rollback"],
      "external_system_contract",
      errors,
    );
  }

  if (touches.includes("database")) {
    for (const command of [
      "pnpm local:bootstrap",
      "pnpm db:types",
      "pnpm db:types:check",
      "git diff --check",
    ]) {
      requireText(
        source,
        command,
        "database_verification",
        `Database work must include \`${command}\`.`,
        errors,
      );
    }
    requireTerms(
      parsed.sections.get(
        "Migration, compatibility, rollout, rollback, and cleanup",
      ) ?? "",
      ["migration", "backfill", "rollback"],
      "database_migration_contract",
      errors,
    );
  }

  if (
    touches.includes("auth") ||
    sensitive.includes("auth") ||
    sensitive.includes("secrets")
  ) {
    const authContract = joinSections(parsed, [
      "Non-negotiable invariants",
      "Exact data, state, protocol, and concurrency contract",
      "Required test and fault matrix",
    ]);
    requirePositiveTerms(
      authContract,
      ["enumeration", "rotation", "session", "redact"],
      "auth_secret_contract",
      errors,
    );
    requireOneOfPositiveTerms(
      authContract,
      ["official API", "official provider", "official library"],
      "auth_official_source_contract",
      errors,
    );
  }

  if (touches.includes("media") || sensitive.includes("media-originals")) {
    requireTerms(
      joinSections(parsed, [
        "Non-negotiable invariants",
        "Exact data, state, protocol, and concurrency contract",
        "Migration, compatibility, rollout, rollback, and cleanup",
        "Required test and fault matrix",
      ]),
      ["quarantine", "actual-byte", "derivative", "original"],
      "media_contract",
      errors,
    );
  }

  if (touches.includes("search") || sensitive.includes("public-search")) {
    requireTerms(
      joinSections(parsed, [
        "Non-negotiable invariants",
        "Exact data, state, protocol, and concurrency contract",
        "Migration, compatibility, rollout, rollback, and cleanup",
        "Required test and fault matrix",
      ]),
      ["public eligibility", "public-only", "stale", "parity"],
      "search_contract",
      errors,
    );
  }

  if (touches.includes("offline")) {
    requireTerms(
      joinSections(parsed, [
        "Exact data, state, protocol, and concurrency contract",
        "UX, accessibility, localization, degraded states, performance, and observability",
        "Required test and fault matrix",
      ]),
      ["queued", "syncing", "failed", "synced", "idempotency", "session"],
      "offline_contract",
      errors,
    );
  }

  if (touches.includes("background-job")) {
    const backgroundJobContract = joinSections(parsed, [
      "Exact data, state, protocol, and concurrency contract",
      "Migration, compatibility, rollout, rollback, and cleanup",
      "Required test and fault matrix",
    ]);
    requireOneOfTerms(
      backgroundJobContract,
      ["claim", "lease", "compare-and-swap", "CAS"],
      "background_job_claim",
      errors,
    );
    requireTerms(
      backgroundJobContract,
      ["retry", "duplicate", "restart"],
      "background_job_contract",
      errors,
    );
  }

  if (touches.includes("analytics")) {
    requireTerms(
      joinSections(parsed, [
        "Non-negotiable invariants",
        "Exact data, state, protocol, and concurrency contract",
        "UX, accessibility, localization, degraded states, performance, and observability",
        "Required test and fault matrix",
      ]),
      [
        "consent",
        "event version",
        "bounded enum",
        "exclusion",
        "no content",
        "failure isolation",
      ],
      "analytics_contract",
      errors,
    );
  }

  if (
    touches.includes("infrastructure") &&
    /\b(?:Apple Container|Docker|container runtime)\b/i.test(source)
  ) {
    requireText(
      source,
      "docs/CONTAINER_RUNTIME_POLICY.md",
      "container_runtime_context",
      "Container-runtime work must include docs/CONTAINER_RUNTIME_POLICY.md.",
      errors,
    );
    requireTerms(
      joinSections(parsed, [
        "Pinned baseline, reproduction, evidence, and counterevidence",
        "Migration, compatibility, rollout, rollback, and cleanup",
      ]),
      ["Apple Container", "exception"],
      "container_runtime_contract",
      errors,
    );
  }

  if (/\b(?:sitemap|robots|noindex|indexable|structured data)\b/i.test(prose)) {
    requireText(
      source,
      "docs/PUBLIC_SEO_AEO_SURFACE_POLICY.md",
      "public_indexing_policy",
      "Public route/indexability work must include docs/PUBLIC_SEO_AEO_SURFACE_POLICY.md.",
      errors,
    );
  }

  if (/\b(?:apps|services)\/[^\s`'"\\]+\.py\b/.test(source)) {
    requireText(
      parsed.sections.get("Verification commands and required evidence") ?? "",
      "uv run --frozen pytest",
      "python_verification",
      "Python work must include `uv run --frozen pytest`.",
      errors,
    );
  }

  if (directProductionMutation === "yes") {
    requireTerms(
      joinSections(parsed, [
        "Ordered implementation plan",
        "Migration, compatibility, rollout, rollback, and cleanup",
        OPTIONAL_LINEAR_TASK_HEADING,
      ]),
      ["read-only", "plan", "apply", "verify", "rollback", "drift"],
      "production_mutation_contract",
      errors,
    );
  }

  if (liveDeployment === "yes") {
    requireValues(touches, ["deployment"], "deployment_touches", errors);
    if (externalSystems.toLowerCase() === "none") {
      addFinding(
        errors,
        "deployment_external_system",
        "Live deployment must name its exact deployment provider in External systems.",
      );
    }
    requireTerms(
      joinSections(parsed, [
        "Verification commands and required evidence",
        "Delivery, exact-SHA proof, and Linear closeout",
      ]),
      ["exact-SHA", "deployment"],
      "deployment_contract",
      errors,
    );
  }

  if (!sensitive.includes("none") && sensitive.length > 0) {
    requireTerms(
      joinSections(parsed, [
        "Non-negotiable invariants",
        "Required test and fault matrix",
        "Failure gates",
      ]),
      ["forbidden", "another-user", "redact"],
      "sensitive_boundary_contract",
      errors,
    );
  }
  if (sensitive.includes("precise-location")) {
    requireTerms(
      joinSections(parsed, [
        "Non-negotiable invariants",
        "Required test and fault matrix",
      ]),
      ["precise location", "negative proof"],
      "precise_location_contract",
      errors,
    );
  }

  validateRepositoryEvidence(parsed, options, errors);
}

function validateCommonSemanticContract(
  parsed: ParsedTask,
  errors: LinearTaskValidationFinding[],
) {
  const outcome = semanticMarkdownText(
    parsed.sections.get("User or operator outcome and behavior") ?? "",
  );
  requireTerms(
    outcome,
    ["degraded", "recovery", "read-back"],
    "outcome_state_contract",
    errors,
  );

  const productThinking = semanticMarkdownText(
    parsed.sections.get("Product thinking and falsification") ?? "",
  );
  const fullSemanticContract = semanticMarkdownText(
    joinSections(parsed, [...REQUIRED_LINEAR_TASK_HEADINGS]),
  );
  const productResearchBranchFields = getStructuredFieldValues(
    productThinking,
    "Product-research branch",
  );
  const productResearchBranch = productResearchBranchFields[0] ?? "";
  if (
    productResearchBranchFields.length !== 1 ||
    !PRODUCT_RESEARCH_BRANCHES.has(productResearchBranch)
  ) {
    addFinding(
      errors,
      "product_research_branch",
      "Product thinking must own exactly one operative `Product-research branch: constrained|no_direct` field; free-form prose is not the branch authority.",
    );
  }
  requireOneOfTerms(
    productThinking,
    ["job", "protected outcome"],
    "product_outcome_contract",
    errors,
  );
  requireTerms(
    productThinking,
    ["load-bearing assumption", "falsification"],
    "product_falsification_contract",
    errors,
  );
  validateConcreteProductThinkingField(
    productThinking,
    /(?:job|protected outcome)/i,
    "product_outcome_concrete",
    "Job/protected outcome",
    errors,
  );
  validateConcreteProductThinkingField(
    productThinking,
    /load-bearing assumption/i,
    "product_assumption_concrete",
    "Load-bearing assumption",
    errors,
  );
  validateConcreteProductThinkingField(
    productThinking,
    /falsification(?: signal)?/i,
    "product_falsification_concrete",
    "Falsification signal",
    errors,
  );
  if ((parsed.metadata.get("User-facing") ?? "") === "no") {
    const productResearchPaths =
      extractProductResearchPaths(productThinking).sort();
    const requiredContextResearchPaths = extractProductResearchPaths(
      parsed.sections.get("Required context") ?? "",
    ).sort();
    const fullContractResearchPaths =
      extractProductResearchPaths(fullSemanticContract).sort();
    const hasExactResearchPathSet =
      productResearchPaths.length > 0 &&
      arraysEqual(productResearchPaths, requiredContextResearchPaths) &&
      arraysEqual(productResearchPaths, fullContractResearchPaths);
    const hasExplainedResearchPathSet =
      hasExactResearchPathSet &&
      productResearchPaths.every((researchPath) =>
        hasProductResearchConstraintExplanation(productThinking, researchPath),
      );
    const hasSpecificNoDirectResearchConclusion =
      hasClosedNoDirectProductResearchConclusion(productThinking) &&
      !hasProductResearchDeferralOrNegation(fullSemanticContract) &&
      !hasNoDirectResearchOverride(fullSemanticContract);
    if (productResearchBranch === "no_direct") {
      if (
        productResearchPaths.length > 0 ||
        requiredContextResearchPaths.length > 0 ||
        fullContractResearchPaths.length > 0
      ) {
        addFinding(
          errors,
          "non_user_product_research_conflict",
          "`Product-research branch: no_direct` requires one closed task-local no-direct conclusion, zero product-research paths anywhere in the contract, and zero later research audit/selection/use/citation obligation.",
        );
      } else if (!hasSpecificNoDirectResearchConclusion) {
        addFinding(
          errors,
          "non_user_product_research_resolution",
          "`Product-research branch: no_direct` requires a specific, affirmative, task-local conclusion and forbids unresolved, guessed, deferred, or later research audit/selection/use/citation language.",
        );
      }
    } else if (
      productResearchBranch === "constrained" &&
      (!hasExplainedResearchPathSet ||
        hasSpecificNoDirectResearchConclusion ||
        hasProductResearchDeferralOrNegation(fullSemanticContract) ||
        hasConstrainedResearchWeakening(fullSemanticContract))
    ) {
      addFinding(
        errors,
        "non_user_product_research_resolution",
        "`Product-research branch: constrained` requires identical non-empty product-research path sets in Product thinking, Required context, and the full contract, plus a concrete task-local constraint for every path and no no-direct/deferral contradiction.",
      );
    }
  }

  const pinned = semanticMarkdownText(
    parsed.sections.get(
      "Pinned baseline, reproduction, evidence, and counterevidence",
    ) ?? "",
  );
  requireTerms(
    pinned,
    ["evidence", "counterevidence", "not proved"],
    "pinned_evidence_contract",
    errors,
  );
  for (const [label, code, display] of [
    [
      /confirmed evidence/i,
      "confirmed_evidence_concrete",
      "Confirmed evidence",
    ],
    [/counterevidence/i, "counterevidence_concrete", "Counterevidence"],
    [/not proved/i, "not_proved_concrete", "Not proved"],
  ] as const) {
    validateConcreteProductThinkingField(pinned, label, code, display, errors);
  }
  const metadataBaseline = parsed.metadata.get("Baseline SHA") ?? "";
  const declaredBaselines = uniqueMatches(
    pinned,
    /\b(?:audit\s+)?baseline(?:\s+SHA)?\s*:?\s*`?([0-9a-f]{40})`?/gi,
    1,
  );
  const uniquePinnedShas = [
    ...new Set(declaredBaselines.map((sha) => sha.toLowerCase())),
  ];
  if (
    /^[0-9a-f]{40}$/.test(metadataBaseline) &&
    (!declaredBaselines.includes(metadataBaseline) ||
      uniquePinnedShas.length !== 1 ||
      uniquePinnedShas[0] !== metadataBaseline)
  ) {
    addFinding(
      errors,
      "pinned_baseline_mismatch",
      "Pinned baseline evidence must contain exactly one unique 40-character SHA and it must equal the Baseline SHA from Execution metadata; additional or conflicting SHAs make the evidence ambiguous.",
    );
  }

  const rootCause = semanticMarkdownText(
    parsed.sections.get("Root cause or proof gap") ?? "",
  );
  const issueKind = parsed.metadata.get("Issue kind") ?? "";
  if (
    issueKind === "coordination_container" &&
    /\bNot applicable\s+—\s+\S.{2,}/i.test(rootCause)
  ) {
    // A coordination container may have no defect of its own when it states why.
  } else {
    requireOneOfTerms(
      rootCause,
      ["closest", "proof gap", "authority"],
      "root_boundary_contract",
      errors,
    );
    requireOneOfTerms(
      rootCause,
      ["stop", "reopen", "decision branch"],
      "root_stop_contract",
      errors,
    );
  }

  const ux =
    parsed.sections.get(
      "UX, accessibility, localization, degraded states, performance, and observability",
    ) ?? "";
  const semanticUx = semanticMarkdownText(ux);
  requireTerms(
    semanticUx,
    ["Locale matrix", "degraded", "performance", "observability"],
    "ux_operability_contract",
    errors,
  );

  const faultMatrix =
    parsed.sections.get("Required test and fault matrix") ?? "";
  const semanticFaultMatrix = semanticMarkdownText(faultMatrix);
  requireTerms(
    semanticFaultMatrix,
    ["happy", "another", "concurrent", "recovery"],
    "fault_matrix_contract",
    errors,
  );
  requireOneOfTerms(
    semanticFaultMatrix,
    ["timeout", "deadline", "crash", "partial success"],
    "fault_injection_contract",
    errors,
  );

  const performanceBudgetFields = getStructuredFieldValues(
    ux,
    "Performance budget",
  );
  const performanceMeasurementFields = getStructuredFieldValues(
    ux,
    "Performance measurement",
  );
  const performanceField = performanceBudgetFields[0];
  const performanceMeasurementField = performanceMeasurementFields[0];
  const verificationBlocks = parseIdBlocks(
    parsed.sections.get("Verification commands and required evidence") ?? "",
    "VER",
  );
  const verificationBodyById = new Map(
    verificationBlocks.map((block) => [block.id, block.body]),
  );
  if (
    performanceBudgetFields.length !== 1 ||
    performanceMeasurementFields.length !== 1
  ) {
    addFinding(
      errors,
      "performance_structured_fields",
      "Define exactly one `Performance budget:` field and one `Performance measurement:` field; free-form prose cannot replace or duplicate them.",
    );
  }
  const performanceNotApplicable = Boolean(
    performanceField &&
    performanceMeasurementField &&
    isSubstantivePerformanceNotApplicable(performanceField) &&
    isSubstantivePerformanceNotApplicable(performanceMeasurementField),
  );
  const budgetNotApplicable = Boolean(
    performanceField && isSubstantivePerformanceNotApplicable(performanceField),
  );
  const measurementNotApplicable = Boolean(
    performanceMeasurementField &&
    isSubstantivePerformanceNotApplicable(performanceMeasurementField),
  );
  if (
    budgetNotApplicable !== measurementNotApplicable ||
    (performanceNotApplicable &&
      performanceField?.toLowerCase() !==
        performanceMeasurementField?.toLowerCase())
  ) {
    addFinding(
      errors,
      "performance_not_applicable_mismatch",
      "Performance budget and measurement must either share the exact same specific `Not applicable — ...` rationale or both use one matching PERF-## contract.",
    );
  }
  const performanceTrigger = stripStructuredUxContractLines(
    joinSections(parsed, [
      "User or operator outcome and behavior",
      "Root cause or proof gap",
      "Exact data, state, protocol, and concurrency contract",
      "UX, accessibility, localization, degraded states, performance, and observability",
      "Measurable acceptance criteria",
      "Required test and fault matrix",
    ]),
  );
  const hasPerformanceTrigger =
    /\b(?:performance|fast|freeze|freezing|hang|hanging|lag|latency|slow|stall|stalled|stalling|unresponsive|jank|janky|pause|wedge|wedged|wedging|deadline|timeout|spinner|alert|pointer trap|resource budget|performance regression)\b/i.test(
      performanceTrigger,
    );
  validateNoWedgeContract(
    ux,
    fullSemanticContract,
    verificationBodyById,
    errors,
  );
  if (performanceNotApplicable && hasPerformanceTrigger) {
    addFinding(
      errors,
      "performance_not_applicable_conflict",
      "Performance cannot be Not applicable when another section declares latency, freeze, responsiveness, spinner, alert, pointer, deadline, timeout, load, or resource behavior.",
    );
  }
  if (
    (performanceField && !performanceNotApplicable) ||
    hasPerformanceTrigger
  ) {
    const parsedPerformanceBudget = performanceField
      ? parsePerformanceBudget(performanceField)
      : undefined;
    if (!parsedPerformanceBudget) {
      addFinding(
        errors,
        "performance_budget_missing",
        "Performance/freeze work must define exactly `Performance budget: PERF-01 (`metric_key`) — `metric_key` is at most <number> <compatible unit>.` (an unconditional cancellation suffix is allowed); one canonical metric, comparator, threshold, and compatible unit only.",
      );
    }
    const parsedPerformanceMeasurement = performanceMeasurementField
      ? parsePerformanceMeasurement(performanceMeasurementField)
      : undefined;
    if (
      parsedPerformanceBudget &&
      (!parsedPerformanceMeasurement ||
        parsedPerformanceMeasurement.metricKey !==
          parsedPerformanceBudget.metricKey ||
        !hasBoundPerformanceVerificationProof(
          verificationBodyById,
          parsedPerformanceBudget,
          parsedPerformanceMeasurement,
        ) ||
        !hasPerformanceBudgetRestatement(
          parsed.sections.get("Measurable acceptance criteria") ?? "",
          parsedPerformanceBudget,
        ) ||
        !hasPerformanceBudgetRestatement(
          parsed.sections.get("Required test and fault matrix") ?? "",
          parsedPerformanceBudget,
        ) ||
        hasConflictingPerformanceRestatement(
          fullSemanticContract,
          parsedPerformanceBudget,
        ))
    ) {
      addFinding(
        errors,
        "performance_measurement_missing",
        "Performance measurement must repeat `PERF-01` and the exact metric, bind one real instrument and concrete target to an existing VER command, restate the identical metric/threshold/unit in acceptance and the fault matrix, and make that VER own the exact authoritative `Performance proof:` receipt without conflicting thresholds.",
      );
    }
    if (
      hasPerformanceContractConflict(ux) ||
      hasGlobalPerformanceWeakening(fullSemanticContract)
    ) {
      addFinding(
        errors,
        "performance_contract_conflict",
        "No later UX clause may waive, disable, skip, make aspirational, or unbound the authoritative performance budget or measurement.",
      );
    }
    requireTerms(
      joinSections(parsed, [
        "Exact data, state, protocol, and concurrency contract",
        "UX, accessibility, localization, degraded states, performance, and observability",
      ]),
      ["deadline", "cancellation", "bounded"],
      "performance_control_contract",
      errors,
    );
    requireTerms(
      faultMatrix,
      ["load", "recovery"],
      "performance_fault_contract",
      errors,
    );
  }

  const acceptance = proseOnly(
    parsed.sections.get("Measurable acceptance criteria") ?? "",
  );
  for (const [pattern, label] of [
    [/\bworks?\b/i, "works"],
    [/\bfast\b/i, "fast"],
    [/\bproperly\b/i, "properly"],
    [/\breliable\b/i, "reliable"],
    [/\bsecure\b/i, "secure"],
    [/\baccessible\b/i, "accessible"],
    [/\bcovered by tests\b/i, "covered by tests"],
  ] as const) {
    if (pattern.test(acceptance)) {
      addFinding(
        errors,
        "qualitative_acceptance",
        `Acceptance criteria must replace qualitative term \`${label}\` with an exact state, count, threshold, error class, and proof mapping.`,
      );
    }
  }
}

function validateIssueKindCompatibility(
  parsed: ParsedTask,
  errors: LinearTaskValidationFinding[],
) {
  const issueKind = parsed.metadata.get("Issue kind") ?? "";
  const userFacing = parsed.metadata.get("User-facing") ?? "";
  const localeScope = parsed.metadata.get("Locale scope") ?? "";
  const repositoryChange = parsed.metadata.get("Repository change") ?? "";
  const directMutation =
    parsed.metadata.get("Direct production-state mutation") ?? "";
  const authorizationStatus = parsed.metadata.get("Authorization status") ?? "";
  const touches = parseCsv(parsed.metadata.get("Touches"));

  if (touches.includes("ui") && userFacing !== "yes") {
    addFinding(
      errors,
      "ui_user_facing_mismatch",
      "A task that changes UI must declare `User-facing: yes`.",
    );
  }
  if (
    userFacing === "no" &&
    !["unchanged", "not-applicable"].includes(localeScope)
  ) {
    addFinding(
      errors,
      "non_user_locale_scope",
      "Non-user-facing work must use Locale scope `unchanged` or `not-applicable` with an exact reason in the UX section.",
    );
  }
  const uxContract =
    parsed.sections.get(
      "UX, accessibility, localization, degraded states, performance, and observability",
    ) ?? "";
  if (
    localeScope === "not-applicable" &&
    !/Locale matrix:\s*Not applicable\s+—\s+\S.{2,}/i.test(uxContract)
  ) {
    addFinding(
      errors,
      "locale_not_applicable_reason",
      "Locale scope `not-applicable` requires `Locale matrix: Not applicable — <specific verified reason>` in the UX section.",
    );
  }
  if (
    localeScope === "unchanged" &&
    (!/Locale matrix:/i.test(uxContract) ||
      !/unchanged/i.test(uxContract) ||
      !/proof/i.test(uxContract))
  ) {
    addFinding(
      errors,
      "locale_unchanged_contract",
      "Locale scope `unchanged` must name the reused locale matrix and its unchanged-contract proof.",
    );
  }
  if (
    repositoryChange === "no" &&
    touches.some((value) => ["repository", "tests", "docs"].includes(value))
  ) {
    addFinding(
      errors,
      "no_repository_touch_mismatch",
      "Repository change `no` cannot claim repository/tests/docs as changed surfaces.",
    );
  }
  if (directMutation === "yes" && authorizationStatus === "not_required") {
    addFinding(
      errors,
      "mutation_authorization_mismatch",
      "Direct production-state mutation requires Authorization status `pending` or `approved`.",
    );
  }

  if (issueKind === "vertical_execution") {
    requireMetadataValues(
      parsed,
      { "User-facing": "yes", "Repository change": "yes" },
      errors,
    );
  } else if (issueKind === "remediation") {
    requireMetadataValues(parsed, { "Repository change": "yes" }, errors);
    requireTerms(
      joinSections(parsed, [
        "Pinned baseline, reproduction, evidence, and counterevidence",
        "Root cause or proof gap",
        "Exact vertical scope, target files, and caller inventory",
        "Required test and fault matrix",
      ]),
      ["reproduc", "closest", "caller", "regression", "recovery"],
      "remediation_kind_contract",
      errors,
    );
  } else if (issueKind === "operator_execution") {
    requireTerms(
      joinSections(parsed, [
        "User or operator outcome and behavior",
        "Ordered implementation plan",
        "Migration, compatibility, rollout, rollback, and cleanup",
        "Verification commands and required evidence",
      ]),
      [
        "operator",
        "environment",
        "classif",
        "plan",
        "verify",
        "rollback",
        "cleanup",
        "receipt",
      ],
      "operator_kind_contract",
      errors,
    );
  } else if (issueKind === "decision_spike") {
    requireMetadataValues(
      parsed,
      {
        "User-facing": "no",
        "Repository change": "yes",
        "Live deployment required": "no",
        "Direct production-state mutation": "no",
      },
      errors,
    );
    requireValues(touches, ["docs"], "decision_touches", errors);
    const targetInventory =
      parsed.sections.get(
        "Exact vertical scope, target files, and caller inventory",
      ) ?? "";
    if (
      !extractRepositoryContextPaths(targetInventory).some((repositoryPath) =>
        repositoryPath.startsWith("docs/"),
      )
    ) {
      addFinding(
        errors,
        "decision_canon_target",
        "A decision_spike must name a concrete backticked docs/*.md canon or roadmap target that records its decision; prose containing only `docs/` is not a target.",
      );
    }
    requireTerms(
      joinSections(parsed, [
        "AI execution directive",
        "Product thinking and falsification",
        "Root cause or proof gap",
        "Ordered implementation plan",
      ]),
      [
        "time-bounded",
        "evidence",
        "decision",
        "canon",
        "reopen",
        "no production behavior",
      ],
      "decision_kind_contract",
      errors,
    );
  } else if (issueKind === "canon_correction") {
    requireMetadataValues(
      parsed,
      {
        "User-facing": "no",
        "Repository change": "yes",
        "Live deployment required": "no",
        "Direct production-state mutation": "no",
      },
      errors,
    );
    requireValues(touches, ["docs"], "canon_touches", errors);
    requireTerms(
      joinSections(parsed, [
        "Pinned baseline, reproduction, evidence, and counterevidence",
        "Exact vertical scope, target files, and caller inventory",
        "Required test and fault matrix",
      ]),
      ["contradict", "authority", "consumer", "stale"],
      "canon_kind_contract",
      errors,
    );
  } else if (issueKind === "coordination_container") {
    requireMetadataValues(
      parsed,
      {
        "User-facing": "no",
        "Repository change": "no",
        "Live deployment required": "no",
        "Direct production-state mutation": "no",
        "Authorization status": "not_required",
      },
      errors,
    );
    const sensitive = parseCsv(parsed.metadata.get("Sensitive boundaries"));
    const externalSystems =
      parsed.metadata.get("External systems")?.trim().toLowerCase() ?? "";
    if (!arraysEqual(touches, ["coordination"])) {
      addFinding(
        errors,
        "coordination_touches",
        "A coordination_container must use exactly `Touches: coordination` with no repository, test, docs, provider, or implementation surface.",
      );
    }
    if (!arraysEqual(sensitive, ["none"])) {
      addFinding(
        errors,
        "coordination_sensitive_boundaries",
        "A coordination_container must use exactly `Sensitive boundaries: none`.",
      );
    }
    if (externalSystems !== "none") {
      addFinding(
        errors,
        "coordination_external_systems",
        "A coordination_container must use exactly `External systems: none`.",
      );
    }
    requireTerms(
      joinSections(parsed, [
        "AI execution directive",
        "Dependencies, ownership boundaries, relations, and non-goals",
        "Failure gates",
      ]),
      ["non-executable", "never assigned", "child", "acyclic", "integration"],
      "coordination_kind_contract",
      errors,
    );
    validateCoordinationChildContract(parsed, errors);
  }
}

function requireMetadataValues(
  parsed: ParsedTask,
  expected: Record<string, string>,
  errors: LinearTaskValidationFinding[],
) {
  for (const [key, value] of Object.entries(expected)) {
    const actual = parsed.metadata.get(key);
    if (actual !== value) {
      addFinding(
        errors,
        "issue_kind_metadata_mismatch",
        `${parsed.metadata.get("Issue kind") || "Issue kind"} requires ${key} \`${value}\`, found \`${actual || "missing"}\`.`,
      );
    }
  }
}

function validateAcceptanceAndVerification(
  parsed: ParsedTask,
  issueKind: string,
  repositoryChange: string,
  options: LinearTaskValidationOptions,
  errors: LinearTaskValidationFinding[],
) {
  const acceptanceBody =
    parsed.sections.get("Measurable acceptance criteria") ?? "";
  const verificationBody =
    parsed.sections.get("Verification commands and required evidence") ?? "";
  const acceptanceBlocks = parseIdBlocks(acceptanceBody, "AC");
  const verificationBlocks = parseIdBlocks(verificationBody, "VER");
  const acceptanceIds = acceptanceBlocks.map((block) => block.id);
  const verificationIds = verificationBlocks.map((block) => block.id);
  const compactContract =
    ["decision_spike", "canon_correction", "coordination_container"].includes(
      issueKind,
    ) || repositoryChange === "no";
  const minimumAcceptanceCount = compactContract ? 3 : 5;
  const minimumVerificationCount = compactContract ? 2 : 3;

  if (new Set(acceptanceIds).size < minimumAcceptanceCount) {
    addFinding(
      errors,
      "acceptance_criteria_count",
      `Define at least ${minimumAcceptanceCount} distinct measurable AC-## criteria for this issue kind and scope.`,
    );
  }
  if (new Set(verificationIds).size < minimumVerificationCount) {
    addFinding(
      errors,
      "verification_count",
      `Define at least ${minimumVerificationCount} distinct VER-## command/evidence blocks for this issue kind and scope.`,
    );
  }
  if (new Set(acceptanceIds).size !== acceptanceIds.length) {
    addFinding(
      errors,
      "acceptance_duplicate",
      "Each AC-## identifier must define exactly one acceptance criterion.",
    );
  }
  if (new Set(verificationIds).size !== verificationIds.length) {
    addFinding(
      errors,
      "verification_duplicate",
      "Each VER-## identifier must define exactly one verification block.",
    );
  }
  validateSequentialIds(acceptanceIds, "AC", errors);
  validateSequentialIds(verificationIds, "VER", errors);

  const acceptanceMap = new Map(
    acceptanceBlocks.map((block) => [
      block.id,
      {
        protects: uniqueMatches(
          block.body.match(/^ {0,3}- Protects:\s*(.+)$/m)?.[1] ?? "",
          /\bINV-\d{2}\b/g,
        ),
        verifies: uniqueMatches(
          block.body.match(/^ {0,3}- Verified by:\s*(.+)$/m)?.[1] ?? "",
          /\bVER-\d{2}\b/g,
        ),
      },
    ]),
  );
  const verificationMap = new Map(
    verificationBlocks.map((block) => [
      block.id,
      {
        proves: uniqueMatches(
          block.body.match(/^- Proves:\s*(.+)$/m)?.[1] ?? "",
          /\bAC-\d{2}\b/g,
        ),
        body: block.body,
      },
    ]),
  );

  for (const block of acceptanceBlocks) {
    const mapping = acceptanceMap.get(block.id);
    if (
      !/^ {0,3}- Protects:\s+/m.test(block.body) ||
      !mapping?.protects.length
    ) {
      addFinding(
        errors,
        "acceptance_invariant_mapping",
        `${block.id} must include a non-empty \`Protects:\` mapping to INV-##.`,
      );
    }
    if (
      !/^ {0,3}- Verified by:\s+/m.test(block.body) ||
      !mapping?.verifies.length
    ) {
      addFinding(
        errors,
        "acceptance_verification_mapping",
        `${block.id} must include a non-empty \`Verified by:\` mapping to VER-##.`,
      );
    }
  }

  for (const block of verificationBlocks) {
    const mapping = verificationMap.get(block.id);
    for (const marker of [
      "Phase",
      "Proves",
      "Command status",
      "Expected receipt",
    ]) {
      if (
        !new RegExp(`^- ${escapeRegExp(marker)}:\\s+`, "m").test(block.body)
      ) {
        addFinding(
          errors,
          "verification_field_missing",
          `${block.id} must include a non-empty \`${marker}:\` field.`,
        );
      }
    }
    if (!mapping?.proves.length) {
      addFinding(
        errors,
        "verification_acceptance_mapping",
        `${block.id} must prove at least one AC-## criterion.`,
      );
    }
    if (!hasFencedBlockWithInfo(block.body, "bash")) {
      addFinding(
        errors,
        "verification_command_missing",
        `${block.id} must include its own fenced bash command/read-back block.`,
      );
    }
    validateVerificationCommandContract(block, parsed, options, errors);
  }

  for (const [acceptanceId, mapping] of acceptanceMap) {
    for (const verificationId of mapping.verifies) {
      const verification = verificationMap.get(verificationId);
      if (!verification) {
        addFinding(
          errors,
          "verification_reference_missing",
          `${acceptanceId} references ${verificationId}, but that verification block does not exist.`,
        );
      } else if (!verification.proves.includes(acceptanceId)) {
        addFinding(
          errors,
          "verification_mapping_mismatch",
          `${acceptanceId} names ${verificationId}, but ${verificationId} does not list ${acceptanceId} in Proves.`,
        );
      }
    }
  }
  for (const [verificationId, mapping] of verificationMap) {
    for (const acceptanceId of mapping.proves) {
      const acceptance = acceptanceMap.get(acceptanceId);
      if (!acceptance) {
        addFinding(
          errors,
          "acceptance_reference_missing",
          `${verificationId} claims unknown ${acceptanceId}.`,
        );
      } else if (!acceptance.verifies.includes(verificationId)) {
        addFinding(
          errors,
          "acceptance_mapping_mismatch",
          `${verificationId} proves ${acceptanceId}, but ${acceptanceId} does not list ${verificationId} in Verified by.`,
        );
      }
    }
  }

  const invariantIds = parseInvariantDefinitionIds(
    parsed.sections.get("Non-negotiable invariants") ?? "",
  );
  const minimumInvariantCount = issueKind === "coordination_container" ? 2 : 3;
  if (new Set(invariantIds).size < minimumInvariantCount) {
    addFinding(
      errors,
      "invariant_count",
      `Define at least ${minimumInvariantCount} stable INV-## invariants for this issue kind.`,
    );
  }
  if (new Set(invariantIds).size !== invariantIds.length) {
    addFinding(
      errors,
      "invariant_duplicate",
      "Each INV-## identifier must define exactly one invariant.",
    );
  }
  validateSequentialIds(invariantIds, "INV", errors);
  const invariantSet = new Set(invariantIds);
  const protectedIds = new Set(
    [...acceptanceMap.values()].flatMap((mapping) => mapping.protects),
  );
  for (const [acceptanceId, mapping] of acceptanceMap) {
    for (const invariantId of mapping.protects) {
      if (!invariantSet.has(invariantId)) {
        addFinding(
          errors,
          "invariant_reference_missing",
          `${acceptanceId} protects unknown ${invariantId}; define it once in Non-negotiable invariants or correct the mapping.`,
        );
      }
    }
  }
  for (const invariantId of invariantIds) {
    if (!protectedIds.has(invariantId)) {
      addFinding(
        errors,
        "invariant_uncovered",
        `${invariantId} must be protected by at least one AC-## criterion.`,
      );
    }
  }

  const faultMatrix =
    parsed.sections.get("Required test and fault matrix") ?? "";
  validateFaultMatrix(
    faultMatrix,
    invariantIds,
    acceptanceIds,
    verificationIds,
    acceptanceMap,
    verificationMap,
    errors,
  );
  validateVerificationSuiteContract(verificationBlocks, parsed, errors);
}

type IdBlock = { id: string; body: string };

function parseInvariantDefinitionIds(source: string): string[] {
  return scanMarkdown(source).lines.flatMap((line) => {
    if (line.insideFence || line.isFence) return [];
    const id = line.text.match(/^ {0,3}\d+\.\s+(?:\*\*)?(INV-\d{2})\b/)?.[1];
    return id ? [id] : [];
  });
}

function parseIdBlocks(source: string, prefix: "AC" | "VER"): IdBlock[] {
  const starts = scanMarkdown(source).lines.flatMap((line) => {
    if (line.insideFence || line.isFence) return [];
    const pattern =
      prefix === "AC"
        ? /^ {0,3}\d+\.\s+(?:\*\*)?(AC-\d{2})\b/
        : /^ {0,3}##\s+(VER-\d{2})\b/;
    const id = line.text.match(pattern)?.[1];
    return id ? [{ id, start: line.start }] : [];
  });

  return starts.map((start, index) => ({
    id: start.id,
    body: source.slice(start.start, starts[index + 1]?.start ?? source.length),
  }));
}

function hasFencedBlockWithInfo(source: string, expectedInfo: string): boolean {
  return scanMarkdown(source).lines.some(
    (line) => line.isFence && line.fenceInfo === expectedInfo,
  );
}

function validateVerificationCommandContract(
  block: IdBlock,
  parsed: ParsedTask,
  options: LinearTaskValidationOptions,
  errors: LinearTaskValidationFinding[],
) {
  const rawStatus =
    block.body.match(/^- Command status:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const status = unwrapBackticks(rawStatus);
  const allowedStatuses = new Set([
    "existing",
    "must_be_added",
    "external_readback",
  ]);
  if (!allowedStatuses.has(status)) {
    addFinding(
      errors,
      "verification_command_status",
      `${block.id} Command status must be exactly \`existing\`, \`must_be_added\`, or \`external_readback\`.`,
    );
    return;
  }
  const repoRoot = path.resolve(
    options.repoRoot ?? DEFAULT_LINEAR_TASK_REPO_ROOT,
  );
  const bashBlocks = extractFencedCodeBlocks(block.body).filter(
    (candidate) => candidate.info === "bash",
  );
  const commandText = bashBlocks
    .map((candidate) => candidate.content)
    .join("\n");
  const shellCommands = bashBlocks.flatMap((candidate) =>
    parseShellCommands(candidate.content, repoRoot, block.id, errors),
  );
  const executables = [
    ...new Set(shellCommands.map((command) => command.executable)),
  ];
  const connectorReadbacks = extractConnectorReadbacks(commandText);
  const hasConcreteConnectorReadback = connectorReadbacks.some((readback) =>
    isConcreteConnectorReadback(readback, parsed),
  );
  const nonProvingExecutables = new Set([
    "date",
    "echo",
    "false",
    "ls",
    "printf",
    "pwd",
    "sleep",
    "true",
    "which",
    "whoami",
  ]);
  const hasAssertionProducingCommand = shellCommands.some((command) => {
    if (nonProvingExecutables.has(path.basename(command.executable))) {
      return false;
    }
    if (
      /(?:^|\s)(?:--help|--version)(?:\s|$)|^git\s+(?:status|log|show|branch|rev-parse)(?:\s|$)/i.test(
        command.raw,
      )
    ) {
      return false;
    }
    return true;
  });
  if (
    (!commandText.trim() || executables.length === 0) &&
    !hasConcreteConnectorReadback
  ) {
    addFinding(
      errors,
      "verification_command_empty",
      `${block.id} must contain an exact executable command or a concrete authenticated connector/API read-back annotation.`,
    );
    return;
  }
  if (!hasAssertionProducingCommand && !hasConcreteConnectorReadback) {
    addFinding(
      errors,
      "verification_command_noop",
      `${block.id} cannot use only observational/no-op commands such as echo, ls, pwd, date, help/version, or non-asserting Git status/log/show/branch/rev-parse as implementation or behavior proof.`,
    );
  }

  const issueKind = parsed.metadata.get("Issue kind") ?? "";
  const repositoryChange = parsed.metadata.get("Repository change") ?? "";
  const externalSystems = parsed.metadata.get("External systems") ?? "none";
  if (repositoryChange === "no" && status !== "external_readback") {
    addFinding(
      errors,
      "no_repository_verification_status",
      `${block.id} must use Command status \`external_readback\` because Repository change is \`no\`.`,
    );
  }
  if (status === "external_readback") {
    if (
      externalSystems.toLowerCase() === "none" &&
      issueKind !== "coordination_container"
    ) {
      addFinding(
        errors,
        "external_readback_without_system",
        `${block.id} uses external_readback but External systems is \`none\` and the issue is not a coordination container.`,
      );
    }
    if (
      !hasConcreteConnectorReadback &&
      !shellCommands.some((command) => isConcreteExternalCommand(command.raw))
    ) {
      addFinding(
        errors,
        "external_readback_operation_missing",
        `${block.id} external_readback must name a concrete authenticated provider/Linear read operation or a supported read-only provider command; help/version/status-only commands are not proof.`,
      );
    }
    if (
      shellCommands.some((command) =>
        isRepositoryOnlyExecutable(command.executable, command.raw),
      )
    ) {
      addFinding(
        errors,
        "external_readback_repository_command",
        `${block.id} external_readback must not substitute repository-local Git, package, test-runner, or script commands for provider/Linear state proof.`,
      );
    }
    if (connectorReadbacks.length > 0 && !hasConcreteConnectorReadback) {
      addFinding(
        errors,
        "external_readback_annotation_invalid",
        `${block.id} connector annotation must use \`# Authenticated <declared provider|Linear> read-back: <concrete read operation and target>\` without mutation verbs.`,
      );
    }
  }

  if (options.checkRepositoryEvidence === false) return;
  const pnpmBuiltins = new Set([
    "add",
    "config",
    "deploy",
    "dlx",
    "env",
    "exec",
    "fetch",
    "import",
    "install",
    "link",
    "list",
    "outdated",
    "patch",
    "prune",
    "publish",
    "rebuild",
    "remove",
    "setup",
    "store",
    "unlink",
    "update",
    "why",
  ]);
  const pnpmScriptRefs = shellCommands.flatMap((command) => {
    const script = extractPnpmScript(command.raw, pnpmBuiltins);
    return script ? [{ script, cwd: command.cwd }] : [];
  });
  const commandPathRefs = shellCommands.flatMap((command) =>
    extractCommandPathReferences(command.raw).map((reference) => ({
      ...reference,
      cwd: command.cwd,
      resolvedPath: resolveCommandPath(command.cwd, reference.repositoryPath),
    })),
  );

  if (status !== "must_be_added") {
    for (const { script, cwd } of pnpmScriptRefs) {
      const packageJsonPath = path.join(cwd, "package.json");
      const packageScripts = existsSync(packageJsonPath)
        ? ((
            JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
              scripts?: Record<string, string>;
            }
          ).scripts ?? {})
        : {};
      if (!packageScripts[script]) {
        addFinding(
          errors,
          "verification_script_missing",
          `${block.id} declares existing pnpm script \`${script}\`, but ${path.relative(repoRoot, packageJsonPath) || "package.json"} does not define it.`,
        );
      }
    }
    for (const commandPath of commandPathRefs) {
      const resolvedCommandPath = commandPath.resolvedPath;
      if (
        !resolvedCommandPath.startsWith(`${repoRoot}${path.sep}`) &&
        resolvedCommandPath !== repoRoot
      ) {
        addFinding(
          errors,
          "verification_path_escape",
          `${block.id} command path \`${commandPath.rawPath}\` resolves outside the repository from its declared working directory.`,
        );
      } else if (!existsSync(resolvedCommandPath)) {
        addFinding(
          errors,
          "verification_path_missing",
          `${block.id} declares existing command path \`${commandPath.rawPath}\`, but it does not exist relative to its declared working directory.`,
        );
      } else if (
        options.checkRepositoryPathsAtBaseline !== false &&
        !gitPathExistsAtCommit(
          repoRoot,
          parsed.metadata.get("Baseline SHA") ?? "",
          path.relative(repoRoot, resolvedCommandPath),
        )
      ) {
        addFinding(
          errors,
          "verification_path_not_at_baseline",
          `${block.id} declares existing command path \`${commandPath.rawPath}\`, but it is absent from the declared Baseline SHA.`,
        );
      }
    }
    for (const command of shellCommands) {
      if (
        !nonProvingExecutables.has(command.executable) &&
        !shellExecutableExists(command.cwd, command.executable)
      ) {
        addFinding(
          errors,
          "verification_executable_missing",
          `${block.id} declares existing executable \`${command.executable}\`, but it is not available in PATH or at the declared working directory.`,
        );
      }
    }
  } else {
    const targetInventory =
      parsed.sections.get(
        "Exact vertical scope, target files, and caller inventory",
      ) ?? "";
    const plannedPaths = [
      ...pnpmScriptRefs.map(({ script }) => script),
      ...commandPathRefs.map(({ rawPath }) => rawPath),
    ];
    if (
      plannedPaths.length === 0 ||
      !plannedPaths.every(
        (candidate) =>
          targetInventory.includes(candidate) &&
          new RegExp(
            `${escapeRegExp(candidate)}[^\\n]*(?:\\(new\\)|\\bnew\\b)`,
            "i",
          ).test(targetInventory),
      )
    ) {
      addFinding(
        errors,
        "verification_planned_command_unowned",
        `${block.id} status must_be_added requires every new script/path to be explicitly marked new in the target inventory.`,
      );
    }
  }
}

function validateSequentialIds(
  ids: string[],
  prefix: "AC" | "VER" | "INV",
  errors: LinearTaskValidationFinding[],
) {
  for (const [index, id] of ids.entries()) {
    const expected = `${prefix}-${String(index + 1).padStart(2, "0")}`;
    if (id !== expected) {
      addFinding(
        errors,
        `${prefix.toLowerCase()}_sequence`,
        `${prefix} identifiers must be unique and sequential from ${prefix}-01; expected ${expected}, found ${id}.`,
      );
    }
  }
}

const DELIVERY_STRUCTURED_LABELS = [
  "Delivery path",
  "Delivery sequence",
  "Issue branch",
  "Implementation SHA variable",
  "Direct main mutation",
  "Local state preservation",
] as const;

function operativeDeliveryProse(source: string) {
  const labels = DELIVERY_STRUCTURED_LABELS.map(escapeRegExp).join("|");
  const fieldPattern = new RegExp(`^ {0,3}-\\s+(?:${labels}):`);
  return scanMarkdown(source)
    .lines.filter(
      (line) =>
        !line.insideFence && !line.isFence && !fieldPattern.test(line.text),
    )
    .map((line) => line.text.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function validateDeliveryContract(
  parsed: ParsedTask,
  issueIdentifier: string,
  issueKind: string,
  repositoryChange: string,
  errors: LinearTaskValidationFinding[],
) {
  const delivery = semanticMarkdownText(
    parsed.sections.get("Delivery, exact-SHA proof, and Linear closeout") ?? "",
  );
  const expectedDeliveryPath =
    repositoryChange === "yes"
      ? "repository_change"
      : issueKind === "coordination_container"
        ? "coordination_container"
        : "external_state_only";
  const expectedDeliverySequence =
    repositoryChange === "yes"
      ? REPOSITORY_DELIVERY_SEQUENCE
      : issueKind === "coordination_container"
        ? COORDINATION_DELIVERY_SEQUENCE
        : EXTERNAL_STATE_DELIVERY_SEQUENCE;
  const deliveryPathFields = getStructuredFieldValues(
    delivery,
    "Delivery path",
  );
  const deliverySequenceFields = getStructuredFieldValues(
    delivery,
    "Delivery sequence",
  );
  if (
    deliveryPathFields.length !== 1 ||
    deliveryPathFields[0] !== expectedDeliveryPath ||
    deliverySequenceFields.length !== 1 ||
    deliverySequenceFields[0] !== expectedDeliverySequence
  ) {
    addFinding(
      errors,
      "delivery_structured_contract",
      `Delivery must define exactly \`Delivery path: ${expectedDeliveryPath}\` and the canonical ordered \`Delivery sequence: ${expectedDeliverySequence}\` as operative Markdown bullets.`,
    );
  }
  const exactDeliveryProse = operativeDeliveryProse(delivery);
  const coordinationChildIds = uniqueMatches(
    parsed.sections.get(
      "Dependencies, ownership boundaries, relations, and non-goals",
    ) ?? "",
    /^\s*\|\s*`?(OVE-\d+)`?\s*\|/gm,
    1,
  );
  if (
    repositoryChange === "no" &&
    exactDeliveryProse !==
      (issueKind === "coordination_container"
        ? coordinationDeliveryProse(coordinationChildIds)
        : EXTERNAL_STATE_DELIVERY_PROSE)
  ) {
    addFinding(
      errors,
      "delivery_exact_contract",
      "External-state-only and coordination delivery sections must use their one canonical copy-ready prose contract without additions, omissions, paraphrases, or contradictory post-terminal actions; task-specific evidence belongs in AC/VER blocks.",
    );
  }
  const commonChecks: ReadonlyArray<[RegExp, string]> = [
    [
      /\b(?:perform|complete|execute|record)\b[^.;\n]{0,280}\b(?:final\s+)?Linear(?:\s+queue)?\s+read-back\b/i,
      "affirmative final Linear read-back",
    ],
    [
      /\b(?:compare|verify)\b[^.;\n]{0,120}\bSHA-256\b/i,
      "affirmative saved-description SHA-256 comparison",
    ],
  ];
  const repositoryChecks: ReadonlyArray<[RegExp, string]> = [
    [/\bstart from current main\b/i, "affirmative current-main starting point"],
    [
      /\b(?:create|start|use|work on)\b[^.;\n]{0,80}\bcodex\/ove-\d+-[a-z0-9-]+\b/i,
      "affirmative issue-specific feature branch requirement",
    ],
    [
      /\bpreserve all unrelated and ignored local files and secrets\b/i,
      "affirmative preservation of unrelated/ignored local files and secrets",
    ],
    [
      /\b(?:use|write|create|record|land|commit)\b[^.;\n]{0,160}\bConventional Commit\b/i,
      "affirmative Conventional Commit requirement",
    ],
    [
      /\b(?:open|create)\b[^.;\n]{0,60}\b(?:PR|pull request)\b/i,
      "affirmative pull request requirement",
    ],
    [/\bpush\b/i, "affirmative branch push requirement"],
    [
      /\b(?:run|execute)\b[^.;\n]{0,80}\b(?:exact-head|PR-head)\s+(?:checks?|gates?)\b/i,
      "affirmative PR-head check requirement",
    ],
    [
      /\bmerge without bypass\b/i,
      "affirmative merge-without-bypass requirement",
    ],
    [
      /\b(?:run|execute)\b[^.;\n]{0,80}\bgit merge-base --is-ancestor\b/i,
      "affirmative main containment command",
    ],
    [
      /\bgit merge-base --is-ancestor\b[^.;\n]{0,160}\borigin\/main\b/i,
      "origin/main containment target",
    ],
    [
      /\b(?:run|execute)\b[^.;\n]{0,100}\bmainline:closeout:check\b/i,
      "affirmative mainline closeout guard",
    ],
  ];
  const noRepositoryChecks: ReadonlyArray<[RegExp, string]> = [
    [
      /\b(?:declare|record)\b[^.;\n]{0,80}\bno[- ]repository[- ]delta\b/i,
      "affirmative no-repository-delta declaration",
    ],
    [
      /\b(?:create|make)\s+no\s+(?:synthetic\s+)?branch[^.;\n]{0,80}\b(?:commit|PR|pull request)\b|\bno\s+(?:synthetic\s+)?branch[^.;\n]{0,80}\b(?:commit|PR|pull request)\b[^.;\n]{0,40}\b(?:is|are|will be)\s+created\b/i,
      "explicit zero branch/commit/PR contract",
    ],
    [
      /\b(?:record|capture|retain|verify)\b[^.;\n]{0,240}\bimmutable\b[^.;\n]{0,100}\breceipt\b/i,
      "affirmative immutable provider/action receipt",
    ],
    [
      /\b(?:record|capture|retain|verify)\b[^.;\n]{0,240}\benvironment(?: identity| class)?\b/i,
      "affirmative environment identity receipt",
    ],
    [
      /\b(?:record|capture|retain|verify)\b[^.;\n]{0,240}\breceipt\b/i,
      "affirmative provider/action receipt",
    ],
    [
      /\b(?:record|capture|retain|verify)\b[^.;\n]{0,240}\brollback(?: result)?\b/i,
      "affirmative rollback result",
    ],
    [
      /\b(?:record|capture|retain|verify)\b[^.;\n]{0,240}\bcleanup(?: result)?\b/i,
      "affirmative cleanup result",
    ],
  ];
  const coordinationChecks: ReadonlyArray<[RegExp, string]> = [
    [
      /\b(?:remain|stay)\s+unassigned\b|\bnever\s+(?:be|become)\s+assigned\b/i,
      "affirmative unassigned container state",
    ],
    [
      /\b(?:remain|stay)\b[^.;\n]{0,60}\boutside\s+`?In Progress`?\b|\bnever\s+(?:enter|be in|move to)\s+`?In Progress`?\b/i,
      "affirmative no-In-Progress state",
    ],
    [
      /\b(?:create|make)\s+no\s+branch[^.;\n]{0,40}\bcommit\b[^.;\n]{0,40}\b(?:PR|pull request)\b[^.;\n]{0,80}\bprovider effect\b|\bno\s+branch[^.;\n]{0,40}\bcommit\b[^.;\n]{0,40}\b(?:PR|pull request)\b[^.;\n]{0,80}\bprovider effect\b[^.;\n]{0,40}\b(?:exists|occurs|is created)\b/i,
      "affirmative zero-own-branch/commit/PR/provider-effect contract",
    ],
    [
      /\b(?:perform|complete|fetch|read back)\b[^.;\n]{0,180}\bchild identifier\b/i,
      "affirmative complete child identifier read-back",
    ],
    [
      /\b(?:prove|verify|read back)\b[^.;\n]{0,180}\b(?:acyclic|DAG)\b/i,
      "affirmative acyclic child DAG proof",
    ],
    [
      /\b(?:prove|verify|read back)\b[^.;\n]{0,180}\bindependently\s+`?Done`?\b/i,
      "affirmative independently completed-child proof",
    ],
    [
      /\b(?:record|capture|verify)\b[^.;\n]{0,180}\bintegration(?: acceptance)?\s+receipt\b/i,
      "affirmative integration acceptance receipt",
    ],
    [
      /\b(?:move|close|complete)\b[^.;\n]{0,180}\bterminal (?:container )?(?:closeout|state)\b/i,
      "affirmative direct terminal closeout",
    ],
  ];
  const checks = [
    ...commonChecks,
    ...(repositoryChange === "yes"
      ? repositoryChecks
      : issueKind === "coordination_container"
        ? coordinationChecks
        : noRepositoryChecks),
  ];

  for (const [pattern, label] of checks) {
    if (!pattern.test(delivery)) {
      addFinding(
        errors,
        "delivery_contract",
        `Delivery section is missing ${label}.`,
      );
    }
  }

  const commonProofTerms =
    /\b(?:Linear(?:\s+queue)?\s+read-back|SHA-256(?: comparison)?)\b/i;
  const repositoryProofTerms =
    /\b(?:codex\/ove-\d+-[a-z0-9-]+|branch|Conventional Commit|push|PR|pull request|exact-head|PR-head|merge without bypass|git merge-base --is-ancestor|mainline:closeout:check)\b/i;
  const noRepositoryProofTerms =
    /\b(?:no[- ]repository[- ]delta|immutable(?: provider| action| redacted)? receipt|environment(?: identity| class)?|provider(?:\/action)? receipt|rollback(?: result)?|cleanup(?: result)?|branch|commit|PR|pull request)\b/i;
  const coordinationProofTerms =
    /\b(?:remain unassigned|outside `?In Progress`?|branch|commit|PR|pull request|provider effect|child identifier|acyclic|DAG|independently `?Done`?|integration(?: acceptance)? receipt|terminal (?:container )?(?:closeout|state))\b/i;
  const weakenedObligation =
    /\b(?:no requirement to|not required to|need not|do not|must not|may not|never|refuse to|fail(?:s|ed)? to|skip|omit|avoid|optional|optionally|may|might|can|could|should|best effort)\b|\bif\s+(?:convenient|possible|available|desired|needed|required|time permits)\b|\bunless\s+(?:necessary|required|convenient|possible)\b|\bwithout\s+(?:a\s+)?(?:PR|pull request|Linear(?:\s+queue)?\s+read-back|main-containment proof|immutable(?: provider| action)? receipt|rollback result|cleanup result)\b|\bno\s+(?:Conventional Commit|PR|pull request|immutable(?: provider| action| redacted)? receipt|environment(?: identity| class)?|provider(?:\/action)? receipt|rollback(?: result)?|cleanup(?: result)?|Linear(?:\s+queue)?\s+read-back|SHA-256(?: comparison)?|child identifier|acyclic DAG|integration(?: acceptance)? receipt|terminal (?:container )?(?:closeout|state))\b/i;
  const relevantProofTerms =
    repositoryChange === "yes"
      ? [commonProofTerms, repositoryProofTerms]
      : issueKind === "coordination_container"
        ? [commonProofTerms, coordinationProofTerms]
        : [commonProofTerms, noRepositoryProofTerms];
  const sectionLevelWeakening =
    /\b(?:aspirational|discretionary|draft|optional|optionally|best effort|best-effort|recommended|recommendation only|nonbinding|non-binding|non-mandatory|unenforceable|not enforceable|suggestions?|advisory|informational(?: only)?|guidance(?: only)?|illustrative|voluntary|may|might|could|should)\b|\bat\s+(?:the\s+)?(?:agent'?s?\s+)?discretion\b|\bsubject\s+to\s+availability\b|\b(?:try|aim|plan|intend)\s+to\b|\bwhere\s+(?:feasible|practical|possible|convenient|practicable)\b|\bonly\s+when\s+(?:feasible|practical|possible|convenient|practicable)\b|\bif\s+(?:feasible|practical|convenient|practicable|possible|available|desired|needed|required|time permits)\b|\bunless\s+(?:necessary|required|convenient|possible)\b|\b(?:not|never)\s+(?:mandatory|required|binding|enforceable)\b|\bno\s+(?:delivery\s+)?(?:step|obligation|proof|requirement)\s+(?:is|remains)\s+(?:mandatory|required|binding|enforceable)\b|\billustrative\s+rather\s+than\s+enforceable\b|\bexamples?\s*,?\s+not\s+requirements?\b|\bfree\s+to\s+(?:disregard|ignore|skip)\b|\bnothing\s+(?:here\s+)?is\s+compulsory\b|\breference\s+material\s+only\b/i;
  if (
    sectionLevelWeakening.test(delivery) ||
    delivery
      .split(/[.;\n]+/)
      .some(
        (clause) =>
          weakenedObligation.test(clause) &&
          relevantProofTerms.some((pattern) => pattern.test(clause)),
      )
  ) {
    addFinding(
      errors,
      "delivery_weakened_obligation",
      "Every applicable delivery obligation must be unconditional and binding across the entire section; `discretionary`, `recommended`, `try/aim/plan/intend`, `where feasible/practical`, `optional`, `may`, `if convenient/available`, `unless necessary`, `no requirement`, `do not`, `skip`, `omit`, and equivalent weakening language is forbidden.",
    );
  }
  const coordinationPolarityConflict =
    /\bnever\s+(?:remain|stay)\s+unassigned\b|\b(?:must|will|may)\s+(?:be|become|remain)\s+assigned\b|\b(?:enter|move to|set[^.;\n]{0,30}to)\s+`?In Progress`?\b/i;
  if (
    issueKind === "coordination_container" &&
    coordinationPolarityConflict.test(delivery)
  ) {
    addFinding(
      errors,
      "delivery_polarity_conflict",
      "Delivery requirements must be affirmative and internally consistent; a negated Conventional Commit/PR/containment/read-back/receipt/rollback/cleanup requirement or an executable coordination state cannot satisfy the contract.",
    );
  }

  if (repositoryChange === "yes" && /^OVE-\d+$/.test(issueIdentifier)) {
    const expectedBranchPrefix = `codex/${issueIdentifier.toLowerCase()}-`;
    const branches = uniqueMatches(delivery, /\bcodex\/ove-\d+-[a-z0-9-]+\b/g);
    const allNamedBranches = uniqueMatches(
      delivery,
      /\b(?:codex|hotfix|feature|fix|bugfix|release|topic|chore|scratch|experiment|refs\/heads)\/[a-z0-9][a-z0-9._/-]*\b/g,
    );
    const imperativeBranchAliases = uniqueMatches(
      delivery,
      /\b(?:create(?:\s+and\s+push)?|work\s+on|switch\s+to|checkout|use(?:\s+branch)?|push)\s+`((?!origin\/main\b)[a-z][a-z0-9._-]*\/[a-z0-9][a-z0-9._/-]*)`/gi,
      1,
    );
    const branch = branches[0];
    const expectedShaVariable = `${issueIdentifier.replace("-", "")}_IMPLEMENTATION_SHA`;
    if (
      branches.length !== 1 ||
      allNamedBranches.length !== 1 ||
      allNamedBranches[0] !== branch ||
      imperativeBranchAliases.some((candidate) => candidate !== branch) ||
      !branch ||
      !branch.startsWith(expectedBranchPrefix)
    ) {
      addFinding(
        errors,
        "delivery_issue_branch_mismatch",
        `Delivery must name exactly one unique issue branch and it must start with \`${expectedBranchPrefix}\` for ${issueIdentifier}.`,
      );
    }

    if (
      exactDeliveryProse !==
      repositoryDeliveryProse(branch ?? "", expectedShaVariable)
    ) {
      addFinding(
        errors,
        "delivery_exact_contract",
        `Repository delivery must use the canonical copy-ready prose contract rendered for \`${branch ?? "the issue branch"}\` and \`${expectedShaVariable}\` without additions, omissions, paraphrases, or post-terminal mutation; task-specific deployment/provider proof belongs in AC/VER blocks.`,
      );
    }

    const issueBranchFields = getStructuredFieldValues(
      delivery,
      "Issue branch",
    );
    const shaVariableFields = getStructuredFieldValues(
      delivery,
      "Implementation SHA variable",
    );
    const directMainFields = getStructuredFieldValues(
      delivery,
      "Direct main mutation",
    );
    const preservationFields = getStructuredFieldValues(
      delivery,
      "Local state preservation",
    );
    if (
      issueBranchFields.length !== 1 ||
      issueBranchFields[0] !== `\`${branch ?? ""}\`` ||
      shaVariableFields.length !== 1 ||
      shaVariableFields[0] !== `\`${expectedShaVariable}\`` ||
      directMainFields.length !== 1 ||
      directMainFields[0] !== "forbidden" ||
      preservationFields.length !== 1 ||
      preservationFields[0] !== "required"
    ) {
      addFinding(
        errors,
        "delivery_repository_fields",
        "Repository delivery must own one exact Issue branch, Implementation SHA variable, `Direct main mutation: forbidden`, and `Local state preservation: required` field.",
      );
    }
    const shaVariables = [
      ...new Set(
        uniqueMatches(delivery, /\b[A-Z][A-Z0-9_]*_IMPLEMENTATION_SHA\b/g),
      ),
    ];
    const escapedShaVariable = escapeRegExp(expectedShaVariable);
    const capturePattern = new RegExp(
      `\\b${escapedShaVariable}=["']?\\$\\(git rev-parse\\s+HEAD\\)["']?`,
    );
    const capture = delivery.match(capturePattern);
    const captureCount = [...delivery.matchAll(new RegExp(capturePattern, "g"))]
      .length;
    const gitHeadCaptureVariables = uniqueMatches(
      delivery,
      /\b([A-Z][A-Z0-9_]*)\s*=\s*\$\(git rev-parse\s+HEAD\)/g,
      1,
    );
    const expectedVariableAssignmentCount = [
      ...delivery.matchAll(
        new RegExp(`\\b${escapedShaVariable}\\s*=(?!=)`, "g"),
      ),
    ].length;
    const shaLikeVariableReferences = uniqueMatches(
      delivery,
      /\$(?:\{)?([A-Z][A-Z0-9_]*(?:SHA|HEAD|COMMIT)[A-Z0-9_]*)(?:\})?/g,
      1,
    );
    const containmentPattern = new RegExp(
      `git merge-base --is-ancestor\\s+["']?\\$(?:\\{)?${escapedShaVariable}(?:\\})?["']?\\s+origin/main`,
    );
    const mergeDirectiveIndex = delivery.search(/\bmerge without bypass\b/i);
    const commitRequirementIndex = delivery.search(/\bConventional Commit\b/i);
    const pushRequirementIndex = delivery.search(/\bpush\b/i);
    const pullRequestIndex = delivery.search(
      /\b(?:open|create)\b[^.;\n]{0,60}\b(?:PR|pull request)\b/i,
    );
    const headCheckIndex = delivery.search(
      /\b(?:exact-head|PR-head)\s+(?:checks?|gates?)\b/i,
    );
    const captureIndex = capture ? delivery.indexOf(capture[0]) : -1;
    const containmentIndex = delivery.search(containmentPattern);
    const mainlineIndex = delivery.search(/\bmainline:closeout:check\b/i);
    if (
      shaVariables.length !== 1 ||
      shaVariables[0] !== expectedShaVariable ||
      gitHeadCaptureVariables.length !== 1 ||
      gitHeadCaptureVariables[0] !== expectedShaVariable ||
      expectedVariableAssignmentCount !== 1 ||
      shaLikeVariableReferences.some(
        (candidate) => candidate !== expectedShaVariable,
      ) ||
      captureCount !== 1 ||
      !capture ||
      !containmentPattern.test(delivery) ||
      captureIndex < commitRequirementIndex ||
      captureIndex < pushRequirementIndex ||
      captureIndex < headCheckIndex ||
      (mergeDirectiveIndex >= 0 && captureIndex > mergeDirectiveIndex) ||
      containmentIndex < mergeDirectiveIndex ||
      mainlineIndex < mergeDirectiveIndex ||
      mainlineIndex < containmentIndex ||
      new RegExp(`\\bunset\\s+${escapedShaVariable}\\b`, "i").test(delivery)
    ) {
      addFinding(
        errors,
        "delivery_sha_capture",
        `Repository delivery must capture exact git rev-parse HEAD into ${expectedShaVariable} after the Conventional Commit, push, and exact-head checks but before the merge directive, then use that same variable in git merge-base --is-ancestor against origin/main.`,
      );
    }
    if (
      pullRequestIndex < 0 ||
      commitRequirementIndex > pushRequirementIndex ||
      pushRequirementIndex > pullRequestIndex ||
      pullRequestIndex > headCheckIndex ||
      headCheckIndex > captureIndex ||
      captureIndex > mergeDirectiveIndex ||
      mergeDirectiveIndex > containmentIndex ||
      containmentIndex > mainlineIndex
    ) {
      addFinding(
        errors,
        "delivery_sequence_conflict",
        "Repository delivery prose must preserve the canonical order: Conventional Commit, branch push, pull request, exact-head checks, feature-SHA capture, merge without bypass, containment, then mainline closeout.",
      );
    }
    if (
      /\b(?:push|publish|commit|advance|update|overwrite|force[- ]?update|move|set|land|fast[- ]?forward|write|replace|point)\b[^.;\n]{0,120}\b(?:the\s+)?(?:origin\/main|refs\/heads\/main|main)(?:\s+ref)?\b[^.;\n]{0,80}\b(?:directly|feature|head|commit|before review)?\b/i.test(
        delivery,
      ) ||
      /\b(?:erase|delete|remove|discard|overwrite|clean)\b[^.;\n]{0,140}\b(?:every|all)\b[^.;\n]{0,80}\b(?:unrelated|ignored|local)\b[^.;\n]{0,80}\b(?:files?|secrets?)\b/i.test(
        delivery,
      ) ||
      /\b(?:erase|delete|remove|discard|overwrite|clean)\b[^.;\n]{0,140}\b(?:unrelated|ignored|local)\b[^.;\n]{0,80}\b(?:files?|secrets?)\b/i.test(
        delivery,
      ) ||
      /\b(?:do not|never|skip|omit|without)\b[^.;\n]{0,100}\b(?:start from current main|preserve all unrelated and ignored local files and secrets)\b/i.test(
        delivery,
      ) ||
      /\b(?:reset|checkout|switch|return|move)\b[^.;\n]{0,120}\b(?:stale|older|previous|audited)\b[^.;\n]{0,60}\b(?:baseline|branch|commit|SHA)\b/i.test(
        delivery,
      ) ||
      /\b(?:reset|checkout|switch|return|move)\b[^.;\n]{0,100}\b(?:branch\s+to\s+)?(?:staging|develop|development|master|release(?:\/[a-z0-9._/-]+)?)\b/i.test(
        delivery,
      ) ||
      /\b(?:exact-head|PR-head)\s+(?:checks?|gates?)\b[^.;\n]{0,120}\b(?:ignore|disregard|despite|even when)\b[^.;\n]{0,80}\b(?:failures?|failed|failure)\b|\bmerge without bypass\b[^.;\n]{0,120}\beven when\b[^.;\n]{0,60}\b(?:checks?|gates?)\s+fail\b|\bSHA-256\b[^.;\n]{0,100}\b(?:ignore|disregard)\b[^.;\n]{0,60}\b(?:mismatch|difference)\b/i.test(
        delivery,
      ) ||
      /\b(?:accept|tolerate|permit|allow|proceed\s+(?:despite|after|with))\b[^.;\n]{0,120}\b(?:failed|failing|failure|failures?)\b[^.;\n]{0,80}\b(?:exact-head|PR-head|checks?|gates?)\b|\b(?:exact-head|PR-head|checks?|gates?)\b[^.;\n]{0,120}\b(?:accept|tolerate|permit|allow|proceed)\b[^.;\n]{0,80}\b(?:failed|failing|failure|failures?)\b/i.test(
        delivery,
      )
    ) {
      addFinding(
        errors,
        "delivery_repository_polarity_conflict",
        "Repository delivery must start from current main, preserve unrelated/ignored local files and secrets, use only the issue branch and issue SHA variable, and never direct-push or direct-commit to main.",
      );
    }
  }
  if (
    issueKind === "coordination_container" &&
    (hasAffirmativeRepositoryDelivery(delivery) ||
      hasAffirmativeProviderEffect(delivery))
  ) {
    addFinding(
      errors,
      "coordination_delivery_mutation",
      "A coordination_container delivery path must not create a branch, commit, PR, or main-containment claim of its own.",
    );
  }
  if (repositoryChange === "no" && hasAffirmativeRepositoryDelivery(delivery)) {
    addFinding(
      errors,
      "no_repository_delivery_mutation",
      "Repository change `no` must explicitly forbid and must never prescribe creating, pushing, opening, or merging a branch, commit, or pull request.",
    );
  }

  const dependencySection =
    parsed.sections.get(
      "Dependencies, ownership boundaries, relations, and non-goals",
    ) ?? "";
  if (
    /^OVE-\d+$/.test(issueIdentifier) &&
    dependencySection
      .split("\n")
      .filter((line) =>
        /^- (Blocked by|Blocks|Related|Duplicate\/replaces):/i.test(line),
      )
      .some((line) =>
        new RegExp(`\\b${escapeRegExp(issueIdentifier)}\\b`, "i").test(line),
      )
  ) {
    addFinding(
      errors,
      "relation_self_edge",
      `${issueIdentifier} must not relate to itself in a blocker/related/duplicate field.`,
    );
  }
}

function validateRequiredContext(
  parsed: ParsedTask,
  repositoryChange: string,
  options: LinearTaskValidationOptions,
  errors: LinearTaskValidationFinding[],
) {
  const context = parsed.sections.get("Required context") ?? "";
  const mandatoryPaths =
    repositoryChange === "yes"
      ? CORE_CONTEXT_PATHS
      : CORE_CONTEXT_PATHS.slice(0, 4);
  for (const requiredPath of mandatoryPaths) {
    requireText(
      context,
      requiredPath,
      "core_context",
      `Required context must include \`${requiredPath}\`.`,
      errors,
    );
  }

  if (options.checkRepositoryEvidence === false) return;
  const repoRoot = path.resolve(
    options.repoRoot ?? DEFAULT_LINEAR_TASK_REPO_ROOT,
  );
  const baselineSha = parsed.metadata.get("Baseline SHA") ?? "";
  for (const repositoryPath of extractRepositoryContextPaths(context)) {
    const resolvedPath = path.resolve(repoRoot, repositoryPath);
    if (
      !resolvedPath.startsWith(`${repoRoot}${path.sep}`) &&
      resolvedPath !== repoRoot
    ) {
      addFinding(
        errors,
        "context_path_escape",
        `Context path \`${repositoryPath}\` resolves outside the repository.`,
      );
    } else if (!existsSync(resolvedPath)) {
      addFinding(
        errors,
        "context_path_missing",
        `Required context path \`${repositoryPath}\` does not exist at the validated repository baseline.`,
      );
    } else if (
      options.checkRepositoryPathsAtBaseline !== false &&
      /^[0-9a-f]{40}$/.test(baselineSha) &&
      !gitPathExistsAtCommit(repoRoot, baselineSha, repositoryPath)
    ) {
      addFinding(
        errors,
        "context_path_not_at_baseline",
        `Required context path \`${repositoryPath}\` is absent from declared Baseline SHA ${baselineSha}.`,
      );
    }
  }
  validateTargetInventoryPaths(parsed, repoRoot, options, errors);
}

function validateUserFacingContract(
  parsed: ParsedTask,
  source: string,
  localeScope: string,
  errors: LinearTaskValidationFinding[],
) {
  const context = parsed.sections.get("Required context") ?? "";
  const productThinking =
    parsed.sections.get("Product thinking and falsification") ?? "";
  const fullSemanticContract = joinSections(parsed, [
    ...REQUIRED_LINEAR_TASK_HEADINGS,
  ]);
  const productResearchBranchFields = getStructuredFieldValues(
    productThinking,
    "Product-research branch",
  );
  requireText(
    context,
    "docs/product-research/README.md",
    "product_research_gate",
    "User-facing work must include docs/product-research/README.md.",
    errors,
  );

  const contextResearchPaths = extractProductResearchPaths(context).sort();
  const productThinkingResearchPaths =
    extractProductResearchPaths(productThinking).sort();
  const fullContractResearchPaths =
    extractProductResearchPaths(fullSemanticContract).sort();
  if (contextResearchPaths.length < 2 || contextResearchPaths.length > 5) {
    addFinding(
      errors,
      "product_research_count",
      `User-facing work must include 2–5 concrete product-research files beyond README.md (found ${contextResearchPaths.length}).`,
    );
  }
  if (
    productResearchBranchFields.length !== 1 ||
    productResearchBranchFields[0] !== "constrained" ||
    !arraysEqual(contextResearchPaths, productThinkingResearchPaths) ||
    !arraysEqual(contextResearchPaths, fullContractResearchPaths) ||
    !productThinkingResearchPaths.every((researchPath) =>
      hasProductResearchConstraintExplanation(productThinking, researchPath),
    ) ||
    hasClosedNoDirectProductResearchConclusion(fullSemanticContract) ||
    hasProductResearchDeferralOrNegation(fullSemanticContract) ||
    hasConstrainedResearchWeakening(fullSemanticContract)
  ) {
    addFinding(
      errors,
      "user_facing_product_research_resolution",
      "User-facing work must declare `Product-research branch: constrained`, cite the identical 2–5 non-README product-research path set in Product thinking and Required context, and explain the concrete task-local constraint supplied by every path; a no-direct or deferred-research conclusion is incompatible with user-facing work.",
    );
  }

  const uxContract =
    parsed.sections.get(
      "UX, accessibility, localization, degraded states, performance, and observability",
    ) ?? "";
  requireTerms(
    uxContract,
    ["Locale matrix", "keyboard", "degraded"],
    "user_facing_ux_contract",
    errors,
  );
  if (localeScope === "not-applicable") {
    addFinding(
      errors,
      "user_facing_locale_scope",
      "User-facing work cannot use Locale scope `not-applicable`.",
    );
  } else {
    validateLocaleMatrix(uxContract, localeScope, errors);
  }
  requireOneOfTerms(
    source,
    ["browser", "manual behavior"],
    "user_facing_behavior_proof",
    errors,
  );
}

function validateAuthorizationContract(
  parsed: ParsedTask,
  directProductionMutation: string,
  authorizationStatus: string,
  errors: LinearTaskValidationFinding[],
) {
  const hasSection = parsed.sections.has(OPTIONAL_LINEAR_TASK_HEADING);
  const body = parsed.sections.get(OPTIONAL_LINEAR_TASK_HEADING) ?? "";

  if (authorizationStatus === "not_required" && hasSection) {
    addFinding(
      errors,
      "authorization_section_unexpected",
      `Remove \"${OPTIONAL_LINEAR_TASK_HEADING}\" when Authorization status is \`not_required\`.`,
    );
  }
  if (["pending", "approved"].includes(authorizationStatus) && !hasSection) {
    addFinding(
      errors,
      "authorization_gate_missing",
      `Authorization status \`${authorizationStatus}\` requires \"${OPTIONAL_LINEAR_TASK_HEADING}\".`,
    );
    return;
  }
  if (!hasSection) return;

  for (const field of [
    "Authorization status",
    "Gate",
    "Required approval artifact",
    "Approval receipt",
    "Work allowed before approval",
    "Work forbidden before approval",
    "Stop/read-back condition",
  ]) {
    if (!new RegExp(`^- ${escapeRegExp(field)}:\\s+`, "m").test(body)) {
      addFinding(
        errors,
        "authorization_field_missing",
        `Authorization section must include a non-empty \`${field}:\` field.`,
      );
    }
  }
  const sectionStatus = unwrapBackticks(
    body.match(/^- Authorization status:\s*(.+)$/m)?.[1]?.trim() ?? "",
  );
  const approvalReceipt =
    body.match(/^- Approval receipt:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const approvalArtifact =
    body.match(/^- Required approval artifact:\s*(.+)$/m)?.[1]?.trim() ?? "";
  if (sectionStatus !== authorizationStatus) {
    addFinding(
      errors,
      "authorization_status_mismatch",
      `Authorization section status \`${sectionStatus || "missing"}\` must match metadata \`${authorizationStatus}\`.`,
    );
  }
  if (
    authorizationStatus === "pending" &&
    !/^- Approval receipt:\s*pending\b/im.test(body)
  ) {
    addFinding(
      errors,
      "authorization_pending_receipt",
      "Pending authorization must state `Approval receipt: pending` and keep the mutation in Failure gates.",
    );
  }
  if (authorizationStatus === "pending") {
    const failureGates = parsed.sections.get("Failure gates") ?? "";
    if (
      !/authorization/i.test(failureGates) ||
      !/pending/i.test(failureGates) ||
      !/(forbid|block|stop|must not|do not)/i.test(failureGates)
    ) {
      addFinding(
        errors,
        "authorization_pending_failure_gate",
        "Pending authorization must remain an explicit blocking condition in Failure gates.",
      );
    }
  }
  if (authorizationStatus === "approved") {
    if (
      /\b(?:pending|not approved|not authorized|unapproved|denied|rejected|revoked|forbidden|absent|unavailable|invalid|unverified|missing|unknown)\b/i.test(
        approvalReceipt,
      )
    ) {
      addFinding(
        errors,
        "authorization_approved_negative_receipt",
        "Approved authorization cannot carry a pending, negative, missing, or unknown approval receipt.",
      );
    }
    const receiptFields = {
      maintainer: extractReceiptField(approvalReceipt, "maintainer"),
      scope: extractReceiptField(approvalReceipt, "approved scope"),
      timestamp: extractReceiptField(approvalReceipt, "timestamp"),
      environment: extractReceiptField(approvalReceipt, "environment"),
      provenance: extractReceiptField(approvalReceipt, "provenance"),
    };
    const invalidReceiptValue =
      /^(?:none|n\/a|unknown|missing|unavailable|not applicable|tbd|todo)$/i;
    const receiptShapeInvalid =
      !receiptFields.maintainer ||
      /^(?:maintainer|approver|owner|someone)$/i.test(
        receiptFields.maintainer,
      ) ||
      !receiptFields.scope ||
      receiptFields.scope.length < 10 ||
      !/\b(?:OVE-\d+|plan|operation|mutation|deployment|rotation|resource|artifact)\b/i.test(
        receiptFields.scope,
      ) ||
      !receiptFields.environment ||
      receiptFields.environment.length < 5 ||
      !receiptFields.provenance ||
      !/(?:\bOVE-\d+\b|https?:\/\/\S+|\b(?:comment|ticket|issue|receipt)\s+\S+)/i.test(
        receiptFields.provenance,
      );
    if (
      Object.values(receiptFields).some(
        (value) => !value || invalidReceiptValue.test(value.trim()),
      ) ||
      receiptShapeInvalid
    ) {
      addFinding(
        errors,
        "authorization_approved_receipt",
        "Approved authorization receipt must provide concrete `maintainer:`, `approved scope:`, `timestamp:`, `environment:`, and `provenance:` values separated by semicolons.",
      );
    }
    if (!isNonFutureIsoTimestamp(receiptFields.timestamp ?? "")) {
      addFinding(
        errors,
        "authorization_timestamp_invalid",
        "Approved authorization receipt must include a real, non-future ISO-8601 UTC timestamp with date and time.",
      );
    }
    const receiptDigests = uniqueMatches(
      approvalReceipt.toLowerCase(),
      /\b(?:sha-?256:)?([0-9a-f]{64})\b/g,
      1,
    );
    const artifactDigests = uniqueMatches(
      approvalArtifact.toLowerCase(),
      /\b(?:sha-?256:)?([0-9a-f]{64})\b/g,
      1,
    );
    if (receiptDigests.length !== 1) {
      addFinding(
        errors,
        "authorization_digest_missing",
        "Approved authorization receipt itself must include exactly one immutable 64-hex plan/artifact digest.",
      );
    }
    if (artifactDigests.length !== 1) {
      addFinding(
        errors,
        "authorization_artifact_digest_missing",
        "Required approval artifact must include exactly one immutable 64-hex digest.",
      );
    }
    if (
      receiptDigests.length === 1 &&
      artifactDigests.length === 1 &&
      receiptDigests[0] !== artifactDigests[0]
    ) {
      addFinding(
        errors,
        "authorization_digest_mismatch",
        "Approval receipt digest must equal the Required approval artifact digest.",
      );
    }
  }
  if (
    directProductionMutation === "yes" &&
    authorizationStatus === "not_required"
  ) {
    addFinding(
      errors,
      "production_authorization_required",
      "Direct production-state mutation cannot use Authorization status `not_required`.",
    );
  }
}

function validateNotApplicableReasons(
  source: string,
  errors: LinearTaskValidationFinding[],
) {
  const prose = proseOnly(source);
  for (const line of prose.split("\n")) {
    if (/\bN\/?A\b/i.test(line)) {
      addFinding(
        errors,
        "bare_not_applicable",
        "Use `Not applicable — <specific verified reason>` instead of bare N/A.",
      );
    }
    if (
      /\bNot applicable\b/i.test(line) &&
      !/\bNot applicable\s+—\s+\S.{2,}/i.test(line)
    ) {
      addFinding(
        errors,
        "bare_not_applicable",
        "Every Not applicable declaration must use an em dash followed by a specific verified reason.",
      );
    }
  }
}

function validateHazardousCommands(
  source: string,
  errors: LinearTaskValidationFinding[],
) {
  const hazardousPatterns: ReadonlyArray<[RegExp, string]> = [
    [/\bgit\s+push\b[^\n]*(?:--force|-f\b)/i, "force-push"],
    [/\bgit\s+reset\s+--hard\b/i, "git reset --hard"],
    [
      /\brm\s+-rf\s+(?:\/\s*$|~(?:\/|\s|$)|\$\{?HOME\}?|\.\.?\s*$)/im,
      "broad rm -rf",
    ],
    [/\b(?:DROP|TRUNCATE)\s+(?:TABLE|DATABASE|SCHEMA)\b/i, "destructive SQL"],
    [/\bDELETE\s+FROM\b(?![^;\n]*\bWHERE\b)/i, "unbounded SQL DELETE"],
    [/\bcurl\b[^\n]*(?:-X|--request)\s+DELETE\b/i, "provider/API DELETE"],
  ];

  const commandSurfaces = [
    proseOnly(source),
    ...extractFencedCodeBlocks(source).map((block) => block.content),
  ];
  for (const surface of commandSurfaces) {
    for (const [pattern, label] of hazardousPatterns) {
      if (pattern.test(surface)) {
        addFinding(
          errors,
          "hazardous_verification_command",
          `Task action text and fenced blocks must not contain ${label}; use a read-only plan plus a separately authorized bounded apply procedure.`,
        );
      }
    }
  }
}

function proseOnly(source: string): string {
  return scanMarkdown(source)
    .lines.filter(
      (line) =>
        !line.insideFence && !line.isFence && !/^ {0,3}>/.test(line.text),
    )
    .map((line) =>
      line.text.replace(/`[^`]*`/g, "").replace(/https?:\/\/\S+/g, ""),
    )
    .join("\n");
}

function extractFencedCodeBlocks(
  source: string,
): Array<{ info: string; content: string }> {
  const blocks: Array<{ info: string; content: string }> = [];
  let current: { info: string; lines: string[] } | undefined;

  for (const line of scanMarkdown(source).lines) {
    if (line.isFence && line.fenceInfo !== undefined) {
      current = { info: line.fenceInfo, lines: [] };
    } else if (line.isFence && current) {
      blocks.push({ info: current.info, content: current.lines.join("\n") });
      current = undefined;
    } else if (line.insideFence && current) {
      current.lines.push(line.text);
    }
  }
  return blocks;
}

type ShellCommand = { raw: string; executable: string; cwd: string };
type ConnectorReadback = { system: string; operation: string };

function parseShellCommands(
  source: string,
  repoRoot: string,
  blockId?: string,
  errors?: LinearTaskValidationFinding[],
): ShellCommand[] {
  const ignored = new Set([
    "set",
    "export",
    "unset",
    "if",
    "then",
    "elif",
    "else",
    "fi",
    "for",
    "while",
    "until",
    "do",
    "done",
    "case",
    "esac",
    "function",
    "return",
    "exit",
  ]);
  const commands: ShellCommand[] = [];
  let cwd = repoRoot;
  for (const segment of splitShellSegments(source)) {
    let raw = segment.trim().replace(/^!\s*/, "");
    if (!raw || raw.startsWith("#") || raw.startsWith("-")) continue;
    raw = raw.replace(/^(?:(?:then|do)\s+)+/, "");
    raw = raw.replace(
      /^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)+/,
      "",
    );
    if (/^cd(?:\s|$)/.test(raw)) {
      const target =
        raw.match(/^cd\s+(?:--\s+)?(?:(['"])(.*?)\1|(\S+))\s*$/)?.[2] ??
        raw.match(/^cd\s+(?:--\s+)?(?:(['"])(.*?)\1|(\S+))\s*$/)?.[3];
      if (!target || target === "-" || /[$`*?\[\]]/.test(target)) {
        if (errors && blockId) {
          addFinding(
            errors,
            "verification_cwd_unsupported",
            `${blockId} must use a literal single-argument \`cd <repository-directory>\` so command paths can be verified.`,
          );
        }
        continue;
      }
      const nextCwd = path.resolve(cwd, target);
      if (
        nextCwd !== repoRoot &&
        !nextCwd.startsWith(`${repoRoot}${path.sep}`)
      ) {
        if (errors && blockId) {
          addFinding(
            errors,
            "verification_cwd_escape",
            `${blockId} changes directory outside the repository with \`${raw}\`.`,
          );
        }
      }
      cwd = nextCwd;
      continue;
    }
    raw = raw.replace(/^env(?:\s+-\S+)*\s+/, "");
    raw = raw.replace(
      /^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)+/,
      "",
    );
    raw = raw.replace(/^(?:command|sudo)\s+/, "");
    const executable = raw
      .match(/^([^\s;&|]+)/)?.[1]
      ?.replace(/^['"]|['"]$/g, "");
    if (!executable || ignored.has(executable)) continue;
    commands.push({ raw, executable, cwd });
  }
  return commands;
}

function splitShellSegments(source: string): string[] {
  const segments: string[] = [];
  let current = "";
  let quote: "'" | '"' | "`" | undefined;
  let escaped = false;
  const flush = () => {
    if (current.trim()) segments.push(current.trim());
    current = "";
  };
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? "";
    const next = source[index + 1] ?? "";
    const previous = source[index - 1] ?? "";
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      current += character;
      escaped = true;
      continue;
    }
    if (quote) {
      current += character;
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      current += character;
      continue;
    }
    if (character === "#" && (!current || /\s$/.test(current))) {
      while (index < source.length && source[index] !== "\n") index += 1;
      flush();
      continue;
    }
    if (
      character === "\n" ||
      character === ";" ||
      character === "|" ||
      (character === "&" && previous !== ">" && next !== ">")
    ) {
      flush();
      if (
        (character === "|" && next === "|") ||
        (character === "&" && next === "&")
      ) {
        index += 1;
      }
      continue;
    }
    current += character;
  }
  flush();
  return segments;
}

function extractConnectorReadbacks(source: string): ConnectorReadback[] {
  return [
    ...source.matchAll(
      /^\s*#\s*Authenticated\s+([^:\n]+?)\s+read-back:\s*(.+)$/gim,
    ),
  ].map((match) => ({
    system: match[1]?.trim() ?? "",
    operation: match[2]?.trim() ?? "",
  }));
}

function isConcreteConnectorReadback(
  readback: ConnectorReadback,
  parsed: ParsedTask,
): boolean {
  const operation = readback.operation;
  if (
    !/\b(?:get|list|fetch|query|inspect|compare|read|describe|show|resolve|view)\b\s+\S.{2,}/i.test(
      operation,
    ) ||
    /\b(?:create|update|delete|mutate|apply|write|rotate|revoke|deploy)\b/i.test(
      operation,
    )
  ) {
    return false;
  }
  const system = readback.system.toLowerCase();
  if (/\blinear\b/.test(system)) return true;
  return parseCsv(parsed.metadata.get("External systems")).some((declared) => {
    const value = declared.toLowerCase();
    return (
      value !== "none" && (system.includes(value) || value.includes(system))
    );
  });
}

function isConcreteExternalCommand(raw: string): boolean {
  const command = raw.trim();
  if (
    /(?:--help|--version|\bversion\b)/i.test(command) ||
    /\b(?:create|update|delete|apply|deploy|remove|destroy|write)\b/i.test(
      command,
    ) ||
    /(?:-X|--method)\s*(?:POST|PUT|PATCH|DELETE)\b/i.test(command)
  ) {
    return false;
  }
  return (
    /^aws\b.*\b(?:get|list|describe|head)[-\w]*\b/i.test(command) ||
    /^doctl\b.*\b(?:get|list)\b/i.test(command) ||
    /^gh\s+(?:api\s+\S+|(?:issue|pr|run)\s+(?:view|list)\b)/i.test(command) ||
    /^vercel\s+(?:inspect|list|ls)\b/i.test(command) ||
    /^wrangler\b.*\b(?:list|head)\b/i.test(command) ||
    /^psql\b.*\b(?:SELECT|SHOW|EXPLAIN)\b/i.test(command) ||
    /^curl\b(?!.*(?:-d\b|--data|--upload|-X\s*(?!GET|HEAD)|--request\s*(?!GET|HEAD))).*https?:\/\/\S+/i.test(
      command,
    ) ||
    /^(?:dig|host|nslookup)\s+(?:\S+\s+)*[A-Za-z0-9.-]+\.?$/i.test(command) ||
    /^openssl\s+s_client\b.*\s-connect\s+\S+/i.test(command)
  );
}

function isRepositoryOnlyExecutable(executable: string, raw: string): boolean {
  const name = path.basename(executable);
  return (
    new Set([
      "bun",
      "git",
      "jest",
      "npm",
      "npx",
      "playwright",
      "pnpm",
      "pytest",
      "uv",
      "vitest",
      "yarn",
    ]).has(name) || /(?:^|\s)(?:\.\/|src\/|scripts\/|tests\/)/.test(raw)
  );
}

function extractPnpmScript(
  raw: string,
  builtins: ReadonlySet<string>,
): string | undefined {
  const script = raw.match(
    /^pnpm(?:\s+run)?\s+(?!exec\b)([a-zA-Z0-9:_-]+)\b/,
  )?.[1];
  return script && !builtins.has(script) ? script : undefined;
}

function extractCommandPathReferences(
  raw: string,
): Array<{ rawPath: string; repositoryPath: string }> {
  const results: Array<{ rawPath: string; repositoryPath: string }> = [];
  const pattern =
    /(?:^|[\s=])((?:(?:\.{1,2}\/)?(?:[A-Za-z0-9_.-]+\/)+)[A-Za-z0-9_./-]+\.(?:ts|tsx|js|mjs|cjs|py|sh|sql|json|md)(?::(?:\d+(?::\d+)?|[A-Za-z_$][\w$]*(?:[.#][A-Za-z_$][\w$]*)*))?)(?=$|[\s'"\\])/g;
  for (const match of raw.matchAll(pattern)) {
    const rawPath = match[1];
    if (!rawPath) continue;
    results.push({
      rawPath,
      repositoryPath: splitRepositoryReference(rawPath),
    });
  }
  return results;
}

function splitRepositoryReference(reference: string): string {
  return (
    reference.match(
      /^(.*\.(?:ts|tsx|js|mjs|cjs|py|sh|sql|json|md)):(?:\d+(?::\d+)?|[A-Za-z_$][\w$]*(?:[.#][A-Za-z_$][\w$]*)*)$/,
    )?.[1] ?? reference
  );
}

function resolveCommandPath(cwd: string, commandPath: string): string {
  return path.resolve(cwd, commandPath);
}

function shellExecutableExists(cwd: string, executable: string): boolean {
  if (["[", "test", "source", "."].includes(executable)) return true;
  if (!/^[A-Za-z0-9_./:+-]+$/.test(executable)) return false;
  if (executable.includes("/")) {
    return existsSync(path.resolve(cwd, executable));
  }
  return spawnSync("which", [executable], { stdio: "ignore" }).status === 0;
}

function joinSections(parsed: ParsedTask, headings: string[]): string {
  return headings
    .map((heading) => parsed.sections.get(heading) ?? "")
    .join("\n");
}

function containsUnresolvedFinalPlaceholder(source: string): boolean {
  const anglePlaceholder =
    /<(?:\d+[- ](?:char|chars|character|characters)\s+(?:sha|digest|hash)|Y{4}-M{2}-D{2}|(?:(?:git[- _.]?)?(?:sha|digest|hash|checksum)(?:[- _]?256)?|owner(?:[- _.]?(?:id|email))?|assignee|resource(?:[- _.]?id)?|issue(?:[- _.]?id)?|implementation(?:[- _.]?sha)?|commit(?:[- _.]?sha)?|branch|slug|command|date|timestamp|environment|provider|project|team|url|path|value|reason|decision|receipt|operation|specific|exact|placeholder|tbd|todo|tbc|fixme)(?:[:| _./-][^>\n]{0,100})?)>/i;
  const squarePlaceholder =
    /\[(?:(?:insert|replace|select|choose|enter|fill|exact)\b[^\]\n]{0,80}|\d+[- ](?:char|chars|character|characters)\s+(?:sha|digest|hash)|(?:(?:git[- _.]?)?(?:sha|digest|hash|checksum)(?:[- _]?256)?|owner(?:[- _.]?(?:id|email))?|assignee|resource(?:[- _.]?id)?|issue(?:[- _.]?id)?|implementation(?:[- _.]?sha)?|commit(?:[- _.]?sha)?|branch|slug|command|date|timestamp|environment|provider|project|team|url|path|value|reason|decision|receipt|operation|placeholder|tbd|todo|tbc|fixme)(?:[:| _./-][^\]\n]{0,100})?)\](?!\((?:https?:\/\/|mailto:|\/|#))(?!\[[^\]\n]+\])/i;
  return (
    /\{\{|\}\}/.test(source) ||
    anglePlaceholder.test(source) ||
    squarePlaceholder.test(source) ||
    /(?:^|[^A-Za-z0-9_])(?:\$OWNER|%OWNER%|@OWNER@|\(OWNER\)|XX_OWNER_XX|__OWNER__)(?![A-Za-z0-9_])/i.test(
      source,
    ) ||
    /(?:^|[^A-Za-z0-9_])(?:\$\{?(?:OWNER|ASSIGNEE)\}?|%(?:OWNER|ASSIGNEE)%|@(?:OWNER|ASSIGNEE)@)(?![A-Za-z0-9_])/i.test(
      source,
    ) ||
    /\b(?:TBD|TBC|TODO|FIXME|TBA|PENDING)(?:_[A-Z0-9]+)+\b|\b[A-Z][A-Z0-9_]*(?:_TBD|_TBC|_TODO|_FIXME|_TBA|_PENDING|_TO_BE_(?:DECIDED|FILLED)|_PLACEHOLDER)\b/i.test(
      source,
    ) ||
    /\b(?:INSERT|REPLACE|FILL|CHOOSE)_[A-Z][A-Z0-9_]*\b|\b(?:REPLACE_ME|FILL_ME|CHOOSE_OWNER)\b/i.test(
      source,
    ) ||
    /(?:^|[^A-Za-z0-9])T\.B\.D\.(?=$|[^A-Za-z0-9])|\bto-be-determined\b/i.test(
      source,
    ) ||
    /\$\{(?:INSERT|REPLACE|FILL|SELECT|CHOOSE|ENTER|TODO|TBD)(?:_[A-Z0-9]+)*\}/i.test(
      source,
    ) ||
    /__+(?:INSERT|REPLACE|FILL|SELECT|CHOOSE|ENTER|TODO|TBD)(?:_[A-Z0-9]+)*__+/i.test(
      source,
    ) ||
    /\b[A-Z][A-Z0-9_]*(?:_GOES_HERE|_TO_INSERT|_TO_REPLACE)\b/i.test(source) ||
    /__+(?:[A-Z0-9]+_)*(?:GOES_HERE|TO_INSERT|TO_REPLACE)__+/i.test(source) ||
    /\b(?:TBC|FIXME|TBA)\b/i.test(source)
  );
}

function extractRepositoryContextPaths(context: string): string[] {
  const candidates = uniqueMatches(
    semanticMarkdownText(context),
    /`([^`\n]+)`/g,
    1,
  );
  return candidates
    .map(splitRepositoryReference)
    .filter(
      (candidate) =>
        candidate === "AGENTS.md" ||
        candidate === "README.md" ||
        candidate === "CLAUDE.md" ||
        candidate === "DESIGN.md" ||
        candidate === "skills-lock.json" ||
        /^(?:\.github|apps|contracts|docs|infra|packages|services)\//.test(
          candidate,
        ),
    );
}

function extractProductResearchPaths(source: string): string[] {
  const semanticSource = semanticMarkdownText(source);
  const backtickPaths = uniqueMatches(semanticSource, /`([^`\n]+)`/g, 1);
  const markdownDestinationPaths = uniqueMatches(
    semanticSource,
    /\]\(<?((?:(?:\.{1,2}\/)+)?docs\/product-research\/[^)>\n]+?\.md)>?\)/gu,
    1,
  );
  const plainPaths = uniqueMatches(
    semanticSource,
    /(?:^|[\s([{"'])((?:(?:\.{1,2}\/)+)?docs\/product-research\/[^\n`<>()\[\]]+?\.md)(?=$|[\s)\]}>"',.;:])/gmu,
    1,
  );
  return [
    ...new Set(
      [...backtickPaths, ...markdownDestinationPaths, ...plainPaths]
        .map(splitRepositoryReference)
        .map((candidate) =>
          candidate.replace(/^(?:(?:\.{1,2}\/)+)(?=docs\/)/, ""),
        )
        .filter(
          (candidate) =>
            candidate.startsWith("docs/product-research/") &&
            candidate.endsWith(".md") &&
            candidate !== "docs/product-research/README.md",
        ),
    ),
  ];
}

function hasProductResearchConstraintExplanation(
  source: string,
  researchPath: string,
): boolean {
  source = semanticMarkdownText(source);
  const escapedPath = escapeRegExp(researchPath);
  const renderedPath = `(?:(?:\\.{1,2}\\/)+)?${escapedPath}`;
  const tokenPattern = new RegExp(
    "(?:`" +
      renderedPath +
      "`|\\[[^\\]\\n]+\\]\\(<?" +
      renderedPath +
      ">?\\)|" +
      renderedPath +
      ")",
    "g",
  );
  for (const tokenMatch of source.matchAll(tokenPattern)) {
    const token = tokenMatch[0] ?? "";
    const index = tokenMatch.index ?? -1;
    if (index < 0) continue;
    const explanation = source.slice(
      index + token.length,
      index + token.length + 180,
    );
    const match = explanation.match(
      /^\s*(?:[,—:;-]\s*)?(?:directly\s+)?(?:constrains?|defines?|requires?|protects?|shapes?|limits?|forbids?|governs?|supplies? evidence(?: for)?|sets?\s+(?:the\s+)?(?:signal|boundary|criterion|policy))\b\s*([^.;\n]+)/i,
    );
    const object = match?.[1]?.trim() ?? "";
    const meaningfulWords = object.match(/[\p{L}\p{N}][\p{L}\p{N}_-]*/gu) ?? [];
    const genericWords = new Set([
      "a",
      "agent",
      "an",
      "and",
      "behavior",
      "bounded",
      "boundary",
      "coding",
      "complete",
      "contract",
      "correct",
      "during",
      "exact",
      "for",
      "implementation",
      "in",
      "itself",
      "only",
      "scope",
      "task",
      "that",
      "the",
      "this",
      "to",
      "work",
    ]);
    const domainWords = meaningfulWords.filter(
      (word) => !genericWords.has(word.toLowerCase()),
    );
    if (
      object.length >= 18 &&
      meaningfulWords.length >= 3 &&
      domainWords.length >= 3 &&
      !/\b(?:no|nothing|none|hardly any|irrelevant|unrelated|ignored|discounted|nonbinding|non-binding|not applicable|does not constrain|constrains nothing|not material|immaterial)\b/i.test(
        object,
      ) &&
      !/^(?:this|that|it|task|work|scope|constraint|boundary)(?:\s+(?:only|itself))?$/i.test(
        object,
      )
    ) {
      return true;
    }
  }
  return false;
}

function hasClosedNoDirectProductResearchConclusion(source: string): boolean {
  if (hasProductResearchDeferralOrNegation(source)) {
    return false;
  }
  return source.split(/[.;\n]+/).some((rawClause) => {
    const clause = rawClause.trim();
    if (clause.length < 40 || !/\bproduct[- ]research\b/i.test(clause)) {
      return false;
    }
    if (
      /\b(?:not\s+ruled\s+out|cannot\s+be\s+ruled\s+out|open|pending|unknown|unclear|unresolved|undetermined|to\s+be\s+determined|tbd|may|might|could|possibly|discovery remains)\b/i.test(
        clause,
      )
    ) {
      return false;
    }
    return (
      /\bhas\s+no\s+direct\s+product[- ]research\s+(?:dependency|constraint|requirement|input)\b/i.test(
        clause,
      ) ||
      /\bno\s+product[- ]research(?:\s+(?:file|document|source|artifact))?\s+(?:directly\s+)?(?:constrains?|governs?|defines?|requires?|applies\s+to|is\s+(?:directly\s+)?applicable\s+to)\b/i.test(
        clause,
      ) ||
      /\bproduct[- ]research\s+is\s+not\s+directly\s+applicable\s+to\b/i.test(
        clause,
      )
    );
  });
}

function hasNoDirectResearchOverride(source: string) {
  source = semanticMarkdownText(source);
  return (
    /\bproduct[- ]research\b[^.;\n]{0,140}\b(?:remains?|becomes?|is|will be)\s+(?:binding|mandatory|required|controlling|authoritative)\b/i.test(
      source,
    ) ||
    /\bproduct[- ]research\s+(?:corpus|evidence|constraints?|sources?)\b[^.;\n]{0,140}\b(?:controls?|governs?|directs?|determines?|dictates?)\b[^.;\n]{0,80}\b(?:implementation|coding|execution|choices?|approach)\b/i.test(
      source,
    ) ||
    /\b(?:product|customer|user|market)[- ]research(?:\s+(?:corpus|evidence|constraints?|sources?))?\b[^.;\n]{0,140}\b(?:(?:will|must|shall|may|can)\s+)?(?:controls?|governs?|guides?|informs?|directs?|determines?|dictates?)\b[^.;\n]{0,80}\b(?:implementation|coding|execution|choices?|approach)\b/i.test(
      source,
    )
  );
}

function hasConstrainedResearchWeakening(source: string) {
  source = semanticMarkdownText(source);
  return (
    /\b(?:cited\s+)?(?:product[- ]research|research)\s+(?:constraints?|evidence|sources?|files?|studies)\b[^.;\n]{0,140}\b(?:advisory|optional|decorative|nonbinding|non-binding|informational|illustrative|reference only|may be ignored|need not apply)\b/i.test(
      source,
    ) ||
    /\b(?:advisory|optional|decorative|nonbinding|non-binding|informational|illustrative|reference only)\b[^.;\n]{0,140}\b(?:product[- ]research|research)\s+(?:constraints?|evidence|sources?|files?|studies)\b/i.test(
      source,
    )
  );
}

function hasProductResearchDeferralOrNegation(source: string) {
  source = semanticMarkdownText(source);
  return (
    /\b(?:research|product[- ]research)(?:\s+(?:file|source|selection|applicability|check|review|audit))?\b[^.;\n]{0,100}\b(?:is|are|was|were|will be)?\s*(?:deferred|postponed|left)\b[^.;\n]{0,80}\b(?:implementation|coding|later|the implementing agent)\b/i.test(
      source,
    ) ||
    /\b(?:relevant\s+)?product[- ]research\b[^.;\n]{0,100}\b(?:will|must|shall|is to)\s+be\s+(?:chosen|selected|identified|reviewed|audited|determined|decided)\b[^.;\n]{0,80}\b(?:during|before|by)\s+(?:implementation|coding|the implementing agent)\b/i.test(
      source,
    ) ||
    /\bproduct[- ]research\b[^.;\n]{0,100}\b(?:becomes?|may become|will become|is|are)\s+(?:mandatory|required|relevant|applicable)\b[^.;\n]{0,80}\b(?:after|during|once)\s+(?:implementation|coding|work)\b/i.test(
      source,
    ) ||
    /\bproduct[- ]research\s+(?:check|review|audit|selection)\b[^.;\n]{0,80}\b(?:occurs?|happens?|runs?|starts?)\b[^.;\n]{0,60}\b(?:during|after|once)\s+(?:implementation|coding|work)\b/i.test(
      source,
    ) ||
    /\b(?:product[- ]research\s+(?:constraints?|evidence|sources?|files?)|cited\s+(?:studies|research|evidence))\b[^.;\n]{0,140}\b(?:merely decorative|decorative only|has no effect|have no effect|does not matter|do not matter|reference decoration|nonbinding|non-binding)\b/i.test(
      source,
    ) ||
    /\b(?:false\s+that|cannot\s+(?:claim|conclude|say)|does\s+not\s+establish|disproves?|rejects?)\b[^.;\n]{0,140}\b(?:no\s+direct\s+product[- ]research|product[- ]research\s+is\s+not\s+directly\s+applicable)\b/i.test(
      source,
    ) ||
    /\b(?:but|however|yet)\b[^.;\n]{0,160}\b(?:select|choose|identify|review|audit|determine)\b[^.;\n]{0,80}\b(?:product[- ]research|research)\b/i.test(
      source,
    ) ||
    /\b(?:implementing agent|executor|assignee)\b[^.;\n]{0,120}\b(?:must|will|should|may)\b[^.;\n]{0,60}\b(?:select|choose|identify|determine|review)\b[^.;\n]{0,60}\b(?:product[- ]research|research)\b/i.test(
      source,
    ) ||
    /\b(?:implementing agent|executor|assignee|implementation)\b[^.;\n]{0,140}\b(?:read|consult|use|cite|select|choose|identify|determine|review|audit)\b[^.;\n]{0,80}\bproduct[- ]research\b|\bproduct[- ]research\b[^.;\n]{0,140}\b(?:must|will|should|still|before)\b[^.;\n]{0,80}\b(?:read|consult|use|cite|select|choose|identify|determine|review|audit|required|starts?)\b/i.test(
      source,
    ) ||
    /\b(?:use|read|consult|cite|select|choose|identify|determine|review|audit)\b[^.;\n]{0,100}\bproduct[- ]research\b[^.;\n]{0,100}\b(?:implementation|coding|approach|details?|before)\b|\bproduct[- ]research\b[^.;\n]{0,100}\b(?:guide|inform|select|determine)s?\b[^.;\n]{0,80}\b(?:implementation|coding|approach|details?)\b/i.test(
      source,
    ) ||
    /\b(?:research|product[- ]research)\b[^.;\n]{0,120}\b(?:must|will|should|still|is\s+to\s+be)\b[^.;\n]{0,100}\b(?:select(?:ed|ion)?|choose|chosen|cite(?:d|ation)?|read|consult|use(?:d)?|review(?:ed)?|audit(?:ed)?)\b[^.;\n]{0,100}\b(?:before\s+(?:implementation|coding|work)|by\s+(?:the\s+)?(?:assignee|executor|implementing agent))\b/i.test(
      source,
    ) ||
    /\b(?:select(?:ed|ion)?|choose|chosen|cite(?:d|ation)?|read|consult|use(?:d)?|review(?:ed)?|audit(?:ed)?)\b[^.;\n]{0,120}\b(?:applicable\s+)?(?:research|product[- ]research)\b[^.;\n]{0,100}\b(?:before\s+(?:implementation|coding|work)|by\s+(?:the\s+)?(?:assignee|executor|implementing agent))\b/i.test(
      source,
    ) ||
    /\b(?:until\s+discovery|for\s+now|future\s+(?:audit|review|discovery)|research\s+(?:later|remains?\s+(?:open|pending|undecided|unknown))|applicability\s+remains?\s+(?:open|pending|undecided|unknown))\b/i.test(
      source,
    ) ||
    /\bproduct[- ]research\b[^.;\n]{0,100}\b(?:applicability\s+)?(?:is|remains?)\s+(?:unresolved|unknown|undecided|pending|open)\b|\bproduct[- ]research\b[^.;\n]{0,120}\b(?:audit|review|selection)\b[^.;\n]{0,60}\b(?:is|remains?)\s+(?:required|needed|pending)\b/i.test(
      source,
    ) ||
    /\b(?:no[- ]direct\s+(?:research\s+)?conclusion|preceding\s+(?:no[- ]direct\s+)?conclusion)\b[^.;\n]{0,100}\b(?:invalid|false|unsupported|rejected|wrong)\b/i.test(
      source,
    ) ||
    /\b(?:cited|applicable|selected|named)?\s*(?:product[- ]research|research)?\s*(?:constraints?|sources?|files?|evidence)\b[^.;\n]{0,140}\b(?:invalid|ignored|nonbinding|non-binding|discarded|inapplicable|not\s+binding)\b|\b(?:invalid|ignored|nonbinding|non-binding|discarded|inapplicable|not\s+binding)\b[^.;\n]{0,140}\b(?:product[- ]research|research)\b/i.test(
      source,
    ) ||
    /\b(?:no\s+direct\s+product[- ]research|product[- ]research\s+is\s+not\s+directly\s+applicable)\b[^.;\n]{0,160}\b(?:not\s+(?:reviewed|assessed|audited|verified)|unverified|guess(?:ed|work)?|not\s+evaluated)\b/i.test(
      source,
    )
  );
}

function validateTargetInventoryPaths(
  parsed: ParsedTask,
  repoRoot: string,
  options: LinearTaskValidationOptions,
  errors: LinearTaskValidationFinding[],
) {
  const inventory =
    parsed.sections.get(
      "Exact vertical scope, target files, and caller inventory",
    ) ?? "";
  const inventoryPaths: string[] = [];
  const baselineSha = parsed.metadata.get("Baseline SHA") ?? "";
  for (const line of inventory.split("\n")) {
    const paths = extractRepositoryContextPaths(line);
    inventoryPaths.push(...paths);
    const markedNew = /(?:\(new\)|\bplanned new\b|\bstatus:\s*new\b)/i.test(
      line,
    );
    for (const repositoryPath of paths) {
      const resolvedPath = path.resolve(repoRoot, repositoryPath);
      if (
        !resolvedPath.startsWith(`${repoRoot}${path.sep}`) &&
        resolvedPath !== repoRoot
      ) {
        addFinding(
          errors,
          "target_path_escape",
          `Target/caller path \`${repositoryPath}\` resolves outside the repository.`,
        );
        continue;
      }
      const exists = existsSync(resolvedPath);
      if (!exists && !markedNew) {
        addFinding(
          errors,
          "target_path_missing",
          `Target/caller path \`${repositoryPath}\` does not exist and is not explicitly marked \`(new)\`.`,
        );
      } else if (exists && markedNew) {
        addFinding(
          errors,
          "target_path_new_conflict",
          `Target path \`${repositoryPath}\` is marked new but already exists at the validated baseline.`,
        );
      }
      if (
        exists &&
        !markedNew &&
        options.checkRepositoryPathsAtBaseline !== false &&
        /^[0-9a-f]{40}$/.test(baselineSha) &&
        !gitPathExistsAtCommit(repoRoot, baselineSha, repositoryPath)
      ) {
        addFinding(
          errors,
          "target_path_not_at_baseline",
          `Existing target/caller path \`${repositoryPath}\` is absent from declared Baseline SHA ${baselineSha}.`,
        );
      }
    }
  }
  if (
    parsed.metadata.get("Repository change") === "yes" &&
    inventoryPaths.length === 0
  ) {
    addFinding(
      errors,
      "target_inventory_empty",
      "Repository-changing work must name at least one concrete existing or planned-new repository path in the target/caller inventory.",
    );
  }
}

function validateRepositoryEvidence(
  parsed: ParsedTask,
  options: LinearTaskValidationOptions,
  errors: LinearTaskValidationFinding[],
) {
  if (options.checkRepositoryEvidence === false) return;
  const repoRoot = path.resolve(
    options.repoRoot ?? DEFAULT_LINEAR_TASK_REPO_ROOT,
  );
  const baselineSha = parsed.metadata.get("Baseline SHA") ?? "";
  if (!/^[0-9a-f]{40}$/.test(baselineSha)) return;

  if (!gitSucceeds(repoRoot, ["cat-file", "-e", `${baselineSha}^{commit}`])) {
    addFinding(
      errors,
      "baseline_commit_missing",
      `Baseline SHA ${baselineSha} is not a commit in the current repository.`,
    );
    return;
  }
  if (!gitSucceeds(repoRoot, ["rev-parse", "--verify", "origin/main"])) {
    addFinding(
      errors,
      "origin_main_missing",
      "origin/main is unavailable; fetch the authoritative main ref before validating or executing a Linear task.",
    );
    return;
  }
  const baselineRef = "origin/main";
  if (
    !gitSucceeds(repoRoot, [
      "merge-base",
      "--is-ancestor",
      baselineSha,
      baselineRef,
    ])
  ) {
    addFinding(
      errors,
      "baseline_not_main",
      `Baseline SHA ${baselineSha} is not contained in ${baselineRef}; re-audit current origin/main or update the contract before execution.`,
    );
  }
}

function gitPathExistsAtCommit(
  repoRoot: string,
  commit: string,
  repositoryPath: string,
): boolean {
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    return false;
  }
  return gitSucceeds(repoRoot, [
    "cat-file",
    "-e",
    `${commit}:${repositoryPath}`,
  ]);
}

function gitSucceeds(repoRoot: string, args: string[]): boolean {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "ignore",
  });
  return result.status === 0;
}

function validateEnumMetadata(
  metadata: Map<string, string>,
  key: string,
  allowed: ReadonlySet<string>,
  errors: LinearTaskValidationFinding[],
) {
  const value = metadata.get(key) ?? "";
  if (!allowed.has(value)) {
    addFinding(
      errors,
      "metadata_value",
      `${key} must be one of: ${[...allowed].join(", ")}.`,
    );
  }
}

function validateConcreteProductThinkingField(
  source: string,
  label: RegExp,
  code: string,
  displayLabel: string,
  errors: LinearTaskValidationFinding[],
) {
  const match = source.match(
    new RegExp(`${label.source}\\s*(?::|is)\\s*([^.;\\n]+)`, "i"),
  );
  const value = match?.[1]?.trim() ?? "";
  if (
    !value ||
    /^(?:unknown|unavailable|missing|none|not proved|not verified|not applicable|to be determined|tbd|todo)\b/i.test(
      value,
    )
  ) {
    addFinding(
      errors,
      code,
      `${displayLabel} must contain a concrete task-local value; an unknown, missing, unavailable, or deferred value is not an executable contract.`,
    );
  }
}

type ParsedPerformanceBudget = {
  metricKey: string;
  threshold: string;
  unit: string;
};

type ParsedPerformanceMeasurement = {
  metricKey: string;
  verificationId: string;
  target: string;
};

type ParsedSlowProof = {
  verificationId: string;
  target: string;
  fault: string;
  controls: string[];
  receiptState: string;
};

const UX_CONTRACT_LABELS = [
  "Performance budget",
  "Performance measurement",
  "Blocking alerts",
  "Global wait overlay",
  "Pointer trap",
  "Unbounded polling/retry",
  "Wait-safe controls",
  "Slow/down proof",
] as const;

function isSubstantivePerformanceNotApplicable(source: string) {
  const match = source.match(/^Not applicable\s+—\s+(.+)\.$/i);
  const reason = match?.[1]?.trim() ?? "";
  const words = reason.match(/[\p{L}\p{N}][\p{L}\p{N}_-]*/gu) ?? [];
  return (
    words.length >= 8 &&
    /\b(?:because|changes? no|performs? no|has no|introduces? no|owns? no)\b/i.test(
      reason,
    ) &&
    /\b(?:runtime|request|response|wait|interaction|user|operator|browser|network|external|background|loop|render|provider|command|execution)\b/i.test(
      reason,
    ) &&
    !/\b(?:whatever|unknown|unverified|guess|not reviewed|not assessed|to be determined|tbd|todo)\b/i.test(
      reason,
    )
  );
}

function parsePerformanceBudget(
  source: string,
): ParsedPerformanceBudget | undefined {
  const match = source.match(
    /^PERF-01 \(`([a-z][a-z0-9_]{2,63})`\) — `\1` (?:is|must be|shall be) (?:<=|<|≤|within|under|at most|no more than|bounded to) (\d+(?:\.\d+)?) ([A-Za-z%/]+)(?: and cancellation (?:fences|rejects|stops|prevents) late (?:completion|responses?|writes?|evidence admission|relation state))?\.$/,
  );
  if (!match) return undefined;
  const metricKey = match[1] ?? "";
  const threshold = match[2] ?? "";
  const unit = match[3] ?? "";
  if (
    !isCanonicalPerformanceMetric(metricKey, unit) ||
    /^(?:fake|dummy|optional|ignored|placeholder|example|sample|test)_/i.test(
      metricKey,
    ) ||
    !isSanePositivePerformanceThreshold(threshold, unit)
  ) {
    return undefined;
  }
  const contractBody = source.slice(source.indexOf("—") + 1);
  if ((contractBody.match(/\d+(?:\.\d+)?/g) ?? []).length !== 1) {
    return undefined;
  }
  return { metricKey, threshold, unit };
}

function isCanonicalPerformanceMetric(metricKey: string, unit: string) {
  const normalizedUnit = unit.toLowerCase();
  if (
    /(?:latency|deadline|timeout|duration|response_time|render_time|interaction_delay|poll_interval)$/.test(
      metricKey,
    )
  ) {
    return /^(?:ms|millisecond|milliseconds|s|second|seconds|minute|minutes)$/.test(
      normalizedUnit,
    );
  }
  if (metricKey.endsWith("queue_depth")) {
    return /^(?:item|items|request|requests|job|jobs)$/.test(normalizedUnit);
  }
  if (metricKey.endsWith("concurrency")) {
    return /^(?:request|requests|read|reads|job|jobs|worker|workers|operation|operations)$/.test(
      normalizedUnit,
    );
  }
  if (metricKey.endsWith("worker_count")) {
    return /^(?:worker|workers)$/.test(normalizedUnit);
  }
  if (metricKey.endsWith("retry_count")) {
    return /^(?:retry|retries)$/.test(normalizedUnit);
  }
  if (metricKey.endsWith("load")) {
    return /^(?:requests|jobs)\/(?:s|second)$/.test(normalizedUnit);
  }
  if (metricKey.endsWith("memory")) {
    return /^(?:mib|mb|kib|kb)$/.test(normalizedUnit);
  }
  if (metricKey.endsWith("resource_budget")) {
    return /^(?:mib|mb|kib|kb|requests|jobs|workers|%)$/.test(normalizedUnit);
  }
  return false;
}

function isSanePositivePerformanceThreshold(threshold: string, unit: string) {
  const value = Number(threshold);
  if (!Number.isFinite(value) || value <= 0) return false;
  const normalizedUnit = unit.toLowerCase();
  const timeMultiplier = /^(?:ms|millisecond|milliseconds)$/.test(
    normalizedUnit,
  )
    ? 1
    : /^(?:s|second|seconds)$/.test(normalizedUnit)
      ? 1_000
      : /^(?:minute|minutes)$/.test(normalizedUnit)
        ? 60_000
        : undefined;
  if (timeMultiplier !== undefined) {
    return value * timeMultiplier <= 86_400_000;
  }
  return value <= 1_000_000_000;
}

function isConcreteVerificationTarget(target: string) {
  return (
    target.length >= 8 &&
    target.length <= 220 &&
    !/\s/.test(target) &&
    !containsUnresolvedFinalPlaceholder(target) &&
    !/^(?:target|test|command|script|selector|path|endpoint|url|example|sample|dummy|fake|none|n\/a)$/i.test(
      target,
    ) &&
    /(?:[/.:#\[\]-]|^[A-Za-z0-9_-]+:[A-Za-z0-9_:-]+$)/.test(target)
  );
}

function verificationBodyBindsTarget(body: string, target: string) {
  const commandStatus = unwrapBackticks(
    body.match(/^- Command status:\s*(.+)$/m)?.[1]?.trim() ?? "",
  );
  const bashBlocks = extractFencedCodeBlocks(body).filter(
    (block) => block.info === "bash",
  );
  const commandText = bashBlocks.map((block) => block.content).join("\n");
  const shellCommands = bashBlocks.flatMap((block) =>
    parseShellCommands(block.content, DEFAULT_LINEAR_TASK_REPO_ROOT),
  );
  if (commandStatus === "external_readback") {
    return (
      extractConnectorReadbacks(commandText).some(
        (readback) =>
          readback.operation.includes(target) &&
          /\b(?:get|list|fetch|query|inspect|compare|read|describe|show|resolve|view)\b\s+\S/i.test(
            readback.operation,
          ) &&
          !/\b(?:create|update|delete|mutate|apply|write|rotate|revoke|deploy)\b/i.test(
            readback.operation,
          ),
      ) ||
      shellCommands.some(
        (command) =>
          command.raw.includes(target) &&
          isConcreteExternalCommand(command.raw),
      )
    );
  }
  return shellCommands.some((command) =>
    shellCommandProducesTargetEvidence(command, target),
  );
}

function shellCommandProducesTargetEvidence(
  command: ShellCommand,
  target: string,
) {
  if (!command.raw.includes(target)) return false;

  const raw = command.raw.trim();
  const executable = path.basename(command.executable).toLowerCase();
  const inspectionOnlyExecutables = new Set([
    "[",
    "cat",
    "find",
    "grep",
    "head",
    "ls",
    "readlink",
    "realpath",
    "rg",
    "sed",
    "stat",
    "tail",
    "test",
    "wc",
  ]);
  if (
    inspectionOnlyExecutables.has(executable) ||
    /^(?:(?:pnpm|npm|npx|yarn|bun)\s+(?:exec\s+)?)(?:cat|find|grep|head|ls|readlink|realpath|rg|sed|stat|tail|test|wc)(?:\s|$)/i.test(
      raw,
    ) ||
    /^(?:bash|sh|zsh)\s+-c\b|^(?:node|python\d*|ruby)\s+(?:-e|-c)\b/i.test(raw)
  ) {
    return false;
  }

  const targetToken = new RegExp(
    `(?:^|[\\s=])['\"]?${escapeRegExp(target)}['\"]?(?=$|[\\s'\"])`,
  );
  if (!targetToken.test(raw)) return false;
  if (unwrapBackticks(raw.replace(/^['"]|['"]$/g, "")) === target) {
    return false;
  }

  const knownEvidenceRunner =
    /(?:^|\s)(?:vitest|jest|playwright|pytest|phpunit|k6|autocannon|wrk|hyperfine|lighthouse)(?:\s|$)/i.test(
      raw,
    );
  const packageEvidenceScript =
    /^(?:pnpm|npm|yarn|bun)(?:\s+run)?\s+(?:test|check|verify|audit|lint|benchmark|bench|perf|performance|smoke|load)(?::[A-Za-z0-9_-]+)?(?:\s|$)/i.test(
      raw,
    );
  const runtimeExecutesTarget =
    /^(?:node|tsx|ts-node|deno\s+run|bun\s+run|python\d*|ruby|bash|sh|zsh)(?:\s+--?\S+)*\s+/i.test(
      raw,
    ) && targetToken.test(raw);
  const directEvidenceExecutable =
    command.executable.includes("/") &&
    /(?:test|check|verify|audit|bench|perf|probe|measure|timer|smoke|load)/i.test(
      command.executable,
    ) &&
    raw !== command.executable;

  return (
    knownEvidenceRunner ||
    packageEvidenceScript ||
    runtimeExecutesTarget ||
    directEvidenceExecutable
  );
}

function parsePerformanceMeasurement(
  source: string,
): ParsedPerformanceMeasurement | undefined {
  const match = source.match(
    /^PERF-01 \(`([a-z][a-z0-9_]{2,63})`\) — (VER-\d{2}) uses the ([a-z0-9][a-z0-9 -]{2,100}(?:timer|probe|histogram|benchmark|test)) at `([^`\n]+)` to (?:measure|time|verify) `\1`\.$/i,
  );
  if (!match) return undefined;
  if (
    /\b(?:fake|fabricated|fictional|sham|pretend|illusory|placeholder|disabled|skipped|optional|advisory|best[- ]effort|dummy|nonexistent|imaginary|banana|if available|if possible|when convenient)\b/i.test(
      source,
    ) ||
    !isConcreteVerificationTarget(match[4] ?? "")
  ) {
    return undefined;
  }
  return {
    metricKey: match[1]!,
    verificationId: match[2]!,
    target: match[4]!,
  };
}

function hasBoundPerformanceVerificationProof(
  verificationBodyById: Map<string, string>,
  budget: ParsedPerformanceBudget,
  measurement: ParsedPerformanceMeasurement,
) {
  const allProofs = [...verificationBodyById].flatMap(([id, body]) =>
    getStructuredFieldValues(body, "Performance proof").map((value) => ({
      id,
      value,
    })),
  );
  if (
    allProofs.length !== 1 ||
    allProofs[0]?.id !== measurement.verificationId
  ) {
    return false;
  }
  const verificationBody =
    verificationBodyById.get(measurement.verificationId) ?? "";
  const expectedProof = `PERF-01 (\`${budget.metricKey}\`) — target \`${measurement.target}\` measures \`${budget.metricKey}\` at most ${budget.threshold} ${budget.unit} and records a bounded threshold receipt.`;
  return (
    verificationBodyBindsTarget(verificationBody, measurement.target) &&
    allProofs[0]?.value === expectedProof
  );
}

function performanceBudgetRestatement(budget: ParsedPerformanceBudget) {
  return `PERF-01 (\`${budget.metricKey}\`) — \`${budget.metricKey}\` is at most ${budget.threshold} ${budget.unit}`;
}

function hasPerformanceBudgetRestatement(
  source: string,
  budget: ParsedPerformanceBudget,
) {
  return semanticMarkdownText(source).includes(
    performanceBudgetRestatement(budget),
  );
}

function hasConflictingPerformanceRestatement(
  source: string,
  budget: ParsedPerformanceBudget,
) {
  const semanticSource = semanticMarkdownText(source);
  const permissiveThreshold = new RegExp(
    "(?:`" +
      escapeRegExp(budget.metricKey) +
      "`|\\b" +
      escapeRegExp(budget.metricKey) +
      "\\b|\\bcanonical\\s+(?:request|deadline|performance (?:budget|limit))\\b|\\brequest\\s+(?:deadline|duration|limit)\\b)[^.;\\n]{0,100}\\b(?:permits?|allows?|is\\s+allowed(?:\\s+to)?|may\\s+(?:consume|take|last|run(?:\\s+for)?|use)|can\\s+(?:consume|take|last|run(?:\\s+for)?|use))\\s+\\d+(?:\\.\\d+)?\\s+[A-Za-z%/]+",
    "i",
  );
  if (permissiveThreshold.test(semanticSource)) return true;
  const pattern = new RegExp(
    "(?:`" +
      escapeRegExp(budget.metricKey) +
      "`|\\b" +
      escapeRegExp(budget.metricKey) +
      "\\b)[^.;\\n]{0,100}(?:(?:is|must be|shall be)\\s+(?:<=|<|≤|within|under|at most|no more than|bounded to)|has\\s+(?:a\\s+)?maximum\\s+of)\\s+(\\d+(?:\\.\\d+)?)\\s+([A-Za-z%/]+)",
    "gi",
  );
  return [...semanticSource.matchAll(pattern)].some(
    (match) =>
      match[1] !== budget.threshold ||
      match[2]?.toLowerCase() !== budget.unit.toLowerCase(),
  );
}

function getStructuredFieldValues(source: string, label: string) {
  const pattern = new RegExp(
    `^ {0,3}-\\s+${escapeRegExp(label)}:\\s*(\\S.*)$`,
    "i",
  );
  return scanMarkdown(semanticMarkdownText(source)).lines.flatMap((line) => {
    if (line.insideFence || line.isFence) return [];
    const value = line.text.match(pattern)?.[1]?.trim();
    return value ? [value] : [];
  });
}

function stripStructuredUxContractLines(source: string) {
  const labels = UX_CONTRACT_LABELS.map(escapeRegExp).join("|");
  const pattern = new RegExp(`^ {0,3}-\\s+(?:${labels}):`);
  return scanMarkdown(semanticMarkdownText(source))
    .lines.filter(
      (line) => line.insideFence || line.isFence || !pattern.test(line.text),
    )
    .map((line) => line.text)
    .join("\n");
}

function hasPerformanceContractConflict(source: string) {
  const residual = stripStructuredUxContractLines(source);
  return /\b(?:performance|budget|deadline|latency|timer|probe|histogram|benchmark|request duration|response time|render time|interaction delay|queue depth|worker count|retry count|poll interval|memory|resource budget|unenforced|advisory|aspirational|skipped|disabled|best[- ]effort|forever|arbitrarily long)\b/i.test(
    residual,
  );
}

function hasGlobalPerformanceWeakening(source: string) {
  const residual = affirmativeContractText(
    stripStructuredUxContractLines(source),
  );
  const performanceEntity =
    "(?:performance|budget|threshold|limit|deadline|latency|timer|probe|histogram|benchmark|request|response|render|interaction|queue|worker|retry|poll|memory|resource|test|receipt)";
  const weakening =
    "(?:advisory|informational(?:\\s+guidance)?|guidance(?:\\s+only)?|illustrative|non[- ]mandatory|unenforced|not\\s+(?:enforced|enforceable|binding|mandatory|a\\s+gate|measured|verified|run)|never\\s+runs?|does\\s+not\\s+run|allowed[- ]to[- ]fail|allowed\\s+to\\s+fail|may\\s+fail|need\\s+not\\s+pass|does\\s+not\\s+need\\s+to\\s+pass|failure\\s+is\\s+allowed|can\\s+be\\s+exceeded|may\\s+be\\s+exceeded|proceeds?\\s+after\\s+an?\\s+overrun|can\\s+run\\s+forever|may\\s+run\\s+forever|runs?\\s+forever|arbitrarily\\s+long|unbounded|ignored|optional|best[- ]effort|aspirational|fabricated|unverified|if\\s+possible|if\\s+available|when\\s+convenient|when\\s+practicable)";
  return (
    new RegExp(
      `\\b${performanceEntity}\\b[^.;\\n]{0,160}\\b${weakening}\\b`,
      "i",
    ).test(residual) ||
    new RegExp(
      `\\b${weakening}\\b[^.;\\n]{0,160}\\b${performanceEntity}\\b`,
      "i",
    ).test(residual)
  );
}

function parseSlowProof(source: string): ParsedSlowProof | undefined {
  const match = source.match(
    /^WAIT-01 — (VER-\d{2}) at `([^`\n]+)` — injected `([^`\n]+)` (?:asserts|proves|verifies) ((?:`[^`\n]+`(?: and )?)+) remain responsive and records a bounded `([^`\n]+)` receipt\.$/,
  );
  if (!match) return undefined;
  const controls = [...match[4]!.matchAll(/`([^`\n]+)`/g)].map((controlMatch) =>
    controlMatch[1]!.trim(),
  );
  return {
    verificationId: match[1]!,
    target: match[2]!.trim(),
    fault: match[3]!.trim(),
    controls,
    receiptState: match[5]!.trim(),
  };
}

function hasWaitScopedInteractionContradiction(source: string) {
  return source.split(/[.;\n]+/).some((rawClause) => {
    const clause = rawClause.trim();
    if (!clause) return false;

    const explicitWaitContext =
      /\b(?:during|throughout|while|until|whenever|when)\b[^,]{0,80}\b(?:wait(?:ing)?|load(?:ing)?|request|response|retry|poll(?:ing)?|timeout|dependency|completion|in[- ]flight)\b|\b(?:pending|waiting|loading|in[- ]flight)\b/i.test(
        clause,
      );
    const interactionEntity =
      /\b(?:controls?|navigation|commands?|links?|actions?|buttons?|clicks?|input|page|interface|ui|platform|product|screen|users?|both|they)\b/i.test(
        clause,
      );
    const referentialWaitControls =
      /\b(?:both controls?|both buttons?|both links?|both actions?|both commands?|both|they|all controls?|all buttons?|all interaction|user input)\b/i.test(
        clause,
      );
    const nonresponsiveBehavior =
      /\b(?:stop(?:s|ped)? responding|stop accepting input|cease working|do not respond|does not respond|must not respond|need not respond|do-not-respond|are merely illustrative|are hidden|lose clickability|cannot be (?:activated|clicked|used)|cannot (?:receive input|navigate)|disabled|noninteractive|unavailable|blocked|inert|captured|intercepted|locked|frozen|freeze[sd]?|unresponsive|read[- ]only|allowed[- ]to[- ]fail|allowed to fail|may fail|swallow(?:s|ed|ing)? (?:every )?(?:clicks?|input)|absorb(?:s|ed|ing)? (?:clicks?|input)|ignore(?:s|d|ing)? clicks?|does not have to work)\b/i.test(
        clause,
      );
    const globalSurfaceFreeze =
      /\b(?:page|interface|ui|platform|product|screen)\b[^,]{0,100}\b(?:frozen|freeze[sd]?|unresponsive|stop(?:s|ped)? responding|do not respond|does not respond|cannot be used|cannot receive input)\b|\b(?:frozen|freeze[sd]?|unresponsive|stop(?:s|ped)? responding|do not respond|does not respond|cannot be used|cannot receive input)\b[^,]{0,100}\b(?:page|interface|ui|platform|product|screen)\b/i.test(
        clause,
      );
    const modalCurtainAbsorption =
      /\b(?:modal[- ]curtain|modal curtain|page[- ]wide (?:veil|scrim|curtain)|full[- ]page (?:veil|scrim|curtain))\b[^,]{0,120}\b(?:absorbs?|swallows?|captures?|intercepts?|blocks?|locks?)\b[^,]{0,60}\b(?:clicks?|input|interaction)\b|\b(?:clicks?|input|interaction)\b[^,]{0,60}\b(?:absorbed|swallowed|captured|intercepted|blocked|locked)\b[^,]{0,120}\b(?:modal[- ]curtain|modal curtain|page[- ]wide (?:veil|scrim|curtain)|full[- ]page (?:veil|scrim|curtain))\b/i.test(
        clause,
      );

    return (
      modalCurtainAbsorption ||
      globalSurfaceFreeze ||
      (interactionEntity &&
        nonresponsiveBehavior &&
        (explicitWaitContext || referentialWaitControls))
    );
  });
}

function validateNoWedgeContract(
  source: string,
  fullSemanticContract: string,
  verificationBodyById: Map<string, string>,
  errors: LinearTaskValidationFinding[],
) {
  const exactEnumFields = [
    "Blocking alerts",
    "Global wait overlay",
    "Pointer trap",
    "Unbounded polling/retry",
  ];
  const exactEnumsValid = exactEnumFields.every((label) => {
    const values = getStructuredFieldValues(source, label);
    return values.length === 1 && values[0] === "forbidden";
  });
  const waitSafeFields = getStructuredFieldValues(source, "Wait-safe controls");
  const slowProofFields = getStructuredFieldValues(source, "Slow/down proof");
  const waitSafeField = waitSafeFields[0] ?? "";
  const waitSafeControls = [...waitSafeField.matchAll(/`([^`\n]+)`/g)].map(
    (match) => match[1]!.trim(),
  );
  const uniqueWaitSafeControls = [...new Set(waitSafeControls)];
  const concreteUsableControls =
    waitSafeFields.length === 1 &&
    uniqueWaitSafeControls.length >= 2 &&
    uniqueWaitSafeControls.length === waitSafeControls.length &&
    uniqueWaitSafeControls.every(
      (control) =>
        control.length >= 6 &&
        /\b(?:navigation|switcher|button|link|action|command|control|input|form|dialog|tab|menu|route|terminal)\b$/i.test(
          control,
        ) &&
        !/^(?:(?:control|button|link|action|command|navigation)\s+(?:[a-z]+|\d+)|(?:first|second|third|primary|secondary|left|right|alpha|beta|gamma|foo|bar|phantom|imaginary|generic|test|dummy|fake)\s+(?:control|button|link|action|command|navigation)|control|controls|interface|ui|unrelated|generic|all)$/i.test(
          control,
        ) &&
        !/\b(?:fake|fabricated|fictional|sham|pretend|illusory|placeholder|dummy|nonexistent|imaginary|phantom|sample|mock|generic|foo|bar)\b/i.test(
          control,
        ),
    ) &&
    /^`[^`\n]+`(?:; `[^`\n]+`)+ — both remain usable and enabled during every wait\.$/.test(
      waitSafeField,
    );

  const parsedSlowProof =
    slowProofFields.length === 1
      ? parseSlowProof(slowProofFields[0] ?? "")
      : undefined;
  const slowControlSetMatches = Boolean(
    parsedSlowProof &&
    parsedSlowProof.controls.length === uniqueWaitSafeControls.length &&
    uniqueWaitSafeControls.every((control) =>
      parsedSlowProof.controls.includes(control),
    ),
  );
  const faultAndReceiptAreConcrete = Boolean(
    parsedSlowProof &&
    isConcreteVerificationTarget(parsedSlowProof.target) &&
    /\b(?:slow|timeout|down|unavailable|deadline)\b/i.test(
      parsedSlowProof.fault,
    ) &&
    (parsedSlowProof.fault.match(/[\p{L}\p{N}]+/gu) ?? []).length >= 2 &&
    !/^(?:fault|issue|problem|test|generic|dummy|fake|sample|mock|placeholder|fictional|banana)(?:\s+(?:slow|timeout|down|unavailable|deadline))?$/i.test(
      parsedSlowProof.fault,
    ) &&
    !/\b(?:sample|mock|placeholder|fictional)\b/i.test(parsedSlowProof.fault) &&
    /^(?:recovery|retry|inconclusive|drift recovery|unstarted|failed|cancelled|timed out|available|degraded|restored|rolled back|completed)$/i.test(
      parsedSlowProof.receiptState,
    ) &&
    !/\b(?:no|not|never|cannot|unable|optional|best[- ]effort|fabricated|fake|unverified|skipped|omitted|doesn'?t|does\s+not|if|unless|when\s+convenient)\b/i.test(
      [
        parsedSlowProof.fault,
        parsedSlowProof.receiptState,
        ...parsedSlowProof.controls,
      ].join(" "),
    ),
  );

  const allNoWedgeProofs = [...verificationBodyById].flatMap(([id, body]) =>
    getStructuredFieldValues(body, "No-wedge proof").map((value) => ({
      id,
      value,
    })),
  );
  const expectedNoWedgeProof = parsedSlowProof
    ? `WAIT-01 — target \`${parsedSlowProof.target}\` injects \`${parsedSlowProof.fault}\`, proves ${parsedSlowProof.controls
        .map((control) => `\`${control}\``)
        .join(
          " and ",
        )} remain responsive, and records a bounded \`${parsedSlowProof.receiptState}\` receipt.`
    : "";
  const noWedgeVerificationBody = parsedSlowProof
    ? (verificationBodyById.get(parsedSlowProof.verificationId) ?? "")
    : "";
  const verificationOwnsProof = Boolean(
    parsedSlowProof &&
    allNoWedgeProofs.length === 1 &&
    allNoWedgeProofs[0]?.id === parsedSlowProof.verificationId &&
    allNoWedgeProofs[0]?.value === expectedNoWedgeProof &&
    verificationBodyBindsTarget(
      noWedgeVerificationBody,
      parsedSlowProof.target,
    ),
  );

  if (
    !exactEnumsValid ||
    !concreteUsableControls ||
    !parsedSlowProof ||
    !slowControlSetMatches ||
    !faultAndReceiptAreConcrete ||
    !verificationOwnsProof
  ) {
    addFinding(
      errors,
      "no_wedge_contract",
      "No-wedge contract must use each exact `forbidden` enum once, name at least two unique concrete controls, define `Slow/down proof: WAIT-01 — VER-## at <target> — ...`, and bind the identical target/fault/control/receipt contract to exactly one existing VER command through its authoritative `No-wedge proof:` field.",
    );
  }

  const residual = stripStructuredUxContractLines(source);
  const globalResidual = affirmativeContractText(
    stripStructuredUxContractLines(fullSemanticContract),
  );
  const hazardMention =
    /\b(?:window\.alert|blocking alerts?|global wait overlay|full[- ]screen wait overlay|global spinner|global modal|indefinite spinner|indefinite modal|pointer traps?|polling forever|retrying forever|unlimited retries|unbounded polling|unbounded retry)\b/i.test(
      residual,
    );
  const controlMention = uniqueWaitSafeControls.some((control) =>
    residual.includes(`\`${control}\``),
  );
  const globalHazardPermission =
    /\b(?:window\.alert|blocking alerts?|global wait overlay|full[- ]screen wait overlay|global spinner|global modal|indefinite spinner|indefinite modal|modal[- ]curtain|modal curtain|pointer traps?|polling forever|retrying forever|unlimited retries|unbounded polling|unbounded retry|page-wide (?:veil|scrim|curtain|input lock)|full-page (?:veil|scrim|curtain|input lock)|all interaction)\b[^.;\n]{0,120}\b(?:required|mandatory|permitted|allowed|enabled|available|supported|appears?|shown|used|acceptable|captured|intercepted|absorbed|swallowed|blocked|locked|inert)\b|\b(?:require|mandate|permit|allow|enable|show|use|capture|intercept|absorb|swallow|block|lock|make)s?\b[^.;\n]{0,120}\b(?:window\.alert|blocking alerts?|global wait overlay|full[- ]screen wait overlay|global spinner|global modal|indefinite spinner|indefinite modal|modal[- ]curtain|modal curtain|pointer traps?|polling forever|retrying forever|unlimited retries|unbounded polling|unbounded retry|page-wide (?:veil|scrim|curtain|input lock)|full-page (?:veil|scrim|curtain|input lock)|all interaction|entire page inert|user input blocked|clicks? swallowed|input absorbed)\b/i.test(
      globalResidual,
    );
  const namedControlDisablement = uniqueWaitSafeControls.some((control) => {
    const quotedControl = escapeRegExp(`\`${control}\``);
    return (
      new RegExp(
        `${quotedControl}[^.;\\n]{0,120}\\b(?:stop accepting input|do not respond|does not respond|hidden|lose clickability|cannot be (?:activated|clicked)|disabled|noninteractive|unavailable|blocked|inert|frozen|unresponsive|allowed[- ]to[- ]fail|allowed to fail|may fail)\\b`,
        "i",
      ).test(globalResidual) ||
      new RegExp(
        `\\b(?:stop accepting input|do not respond|does not respond|hidden|lose clickability|cannot be (?:activated|clicked)|disabled|noninteractive|unavailable|blocked|inert|frozen|unresponsive|allowed[- ]to[- ]fail|allowed to fail|may fail)\\b[^.;\\n]{0,120}${quotedControl}`,
        "i",
      ).test(globalResidual)
    );
  });
  const scopedInteractionContradiction =
    hasWaitScopedInteractionContradiction(globalResidual);
  const noWedgeWeakening =
    /\b(?:wait[- ]safe controls?|safeguards?|controls?|navigation|buttons?|links?|actions?|no[- ]wedge (?:contract|proof))\b[^.;\n]{0,140}\b(?:informational|guidance|illustrative|optional|non[- ]mandatory|not enforceable|need not (?:remain )?(?:operable|usable|responsive)|when practicable|when convenient|if possible)\b|\b(?:informational|guidance|illustrative|optional|non[- ]mandatory|not enforceable|when practicable|when convenient|if possible)\b[^.;\n]{0,140}\b(?:wait[- ]safe controls?|safeguards?|controls?|navigation|buttons?|links?|actions?|no[- ]wedge (?:contract|proof))\b/i.test(
      globalResidual,
    );
  if (
    hazardMention ||
    controlMention ||
    globalHazardPermission ||
    namedControlDisablement ||
    scopedInteractionContradiction ||
    noWedgeWeakening
  ) {
    addFinding(
      errors,
      "no_wedge_positive_conflict",
      "The exact no-wedge fields are the sole UX authority: later prose cannot mention or re-enable blocking alerts, global/full-screen wait overlays or spinners/modals, pointer traps, forever/unbounded retry/polling, repeat a named wait-safe control, or make controls nonresponsive.",
    );
  }
}

function validateFaultMatrix(
  source: string,
  invariantIds: string[],
  acceptanceIds: string[],
  verificationIds: string[],
  acceptanceMap: Map<string, { protects: string[]; verifies: string[] }>,
  verificationMap: Map<string, { proves: string[]; body: string }>,
  errors: LinearTaskValidationFinding[],
) {
  const tableLines = scanMarkdown(source)
    .lines.filter(
      (line) =>
        !line.insideFence &&
        !line.isFence &&
        /^ {0,3}\|.*\|\s*$/.test(line.text),
    )
    .map((line) =>
      line.text
        .trim()
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim()),
    );
  const headerIndex = tableLines.findIndex(
    (cells) =>
      cells.length === 7 &&
      cells.map((cell) => cell.toLowerCase()).join("|") ===
        "case|protects|proves|verification|level|fault/input|expected receipt",
  );
  if (headerIndex < 0) {
    addFinding(
      errors,
      "fault_matrix_table_missing",
      "Required test and fault matrix must use the exact seven-column Case/Protects/Proves/Verification/Level/Fault/input/Expected receipt table.",
    );
    invariantIds.forEach((id) =>
      addFinding(
        errors,
        "fault_matrix_invariant_missing",
        `Required test and fault matrix must validly map ${id}.`,
      ),
    );
    acceptanceIds.forEach((id) =>
      addFinding(
        errors,
        "fault_matrix_acceptance_missing",
        `Required test and fault matrix must validly map ${id}.`,
      ),
    );
    verificationIds.forEach((id) =>
      addFinding(
        errors,
        "fault_matrix_verification_missing",
        `Required test and fault matrix must validly map ${id}.`,
      ),
    );
    return;
  }
  const rows = tableLines
    .slice(headerIndex + 1)
    // Linear's editor normalizes Markdown table delimiters to two dashes on
    // authenticated read-back. Accept that canonical provider form as well as
    // CommonMark's three-or-more-dash source form so saved-body validation can
    // evaluate the actual rows instead of treating the delimiter as row one.
    .filter((cells) => !cells.every((cell) => /^:?-{2,}:?$/.test(cell)));
  if (rows.length === 0) {
    addFinding(
      errors,
      "fault_matrix_table_missing",
      "Fault matrix table must contain at least one concrete data row.",
    );
    return;
  }
  const validInvariantCoverage = new Set<string>();
  const validAcceptanceCoverage = new Set<string>();
  const validVerificationCoverage = new Set<string>();
  for (const [index, cells] of rows.entries()) {
    if (
      cells.length !== 7 ||
      cells.some(
        (cell) =>
          !cell ||
          containsUnresolvedFinalPlaceholder(cell) ||
          /\b(?:TBD|TODO)\b/i.test(cell),
      )
    ) {
      addFinding(
        errors,
        "fault_matrix_row_field",
        `Fault matrix data row ${index + 1} must contain seven concrete non-placeholder fields.`,
      );
      continue;
    }
    const rowInvariants = uniqueMatches(cells[1] ?? "", /\bINV-\d{2}\b/g);
    const rowAcceptances = uniqueMatches(cells[2] ?? "", /\bAC-\d{2}\b/g);
    const rowVerifications = uniqueMatches(cells[3] ?? "", /\bVER-\d{2}\b/g);
    let rowValid =
      rowInvariants.length > 0 &&
      rowAcceptances.length > 0 &&
      rowVerifications.length > 0;
    if (!rowValid) {
      addFinding(
        errors,
        "fault_matrix_row_mapping",
        `Fault matrix row ${index + 1} must contain at least one INV-##, AC-##, and VER-## mapping.`,
      );
      continue;
    }
    for (const id of rowInvariants) {
      if (!invariantIds.includes(id)) rowValid = false;
    }
    for (const id of rowAcceptances) {
      if (!acceptanceMap.has(id)) rowValid = false;
    }
    for (const id of rowVerifications) {
      if (!verificationMap.has(id)) {
        rowValid = false;
        addFinding(
          errors,
          "fault_matrix_verification_unknown",
          `Required test and fault matrix references unknown ${id}.`,
        );
      }
    }
    const chainValid =
      rowInvariants.every((invariantId) =>
        rowAcceptances.some((acceptanceId) =>
          acceptanceMap.get(acceptanceId)?.protects.includes(invariantId),
        ),
      ) &&
      rowAcceptances.every((acceptanceId) => {
        const mapping = acceptanceMap.get(acceptanceId);
        return (
          rowInvariants.some((id) => mapping?.protects.includes(id)) &&
          rowVerifications.some((id) => mapping?.verifies.includes(id))
        );
      }) &&
      rowVerifications.every((verificationId) =>
        rowAcceptances.some((id) =>
          verificationMap.get(verificationId)?.proves.includes(id),
        ),
      );
    if (!chainValid) {
      rowValid = false;
      addFinding(
        errors,
        "fault_matrix_row_mapping",
        `Fault matrix row ${index + 1} has an inconsistent INV -> AC -> VER chain.`,
      );
    }
    if (rowValid) {
      rowInvariants.forEach((id) => validInvariantCoverage.add(id));
      rowAcceptances.forEach((id) => validAcceptanceCoverage.add(id));
      rowVerifications.forEach((id) => validVerificationCoverage.add(id));
    }
  }
  for (const id of invariantIds) {
    if (!validInvariantCoverage.has(id)) {
      addFinding(
        errors,
        "fault_matrix_invariant_missing",
        `Required test and fault matrix must validly map ${id}.`,
      );
    }
  }
  for (const id of acceptanceIds) {
    if (!validAcceptanceCoverage.has(id)) {
      addFinding(
        errors,
        "fault_matrix_acceptance_missing",
        `Required test and fault matrix must validly map ${id}.`,
      );
    }
  }
  for (const id of verificationIds) {
    if (!validVerificationCoverage.has(id)) {
      addFinding(
        errors,
        "fault_matrix_verification_missing",
        `Required test and fault matrix must validly map ${id}.`,
      );
    }
  }
}

function validateVerificationSuiteContract(
  verificationBlocks: IdBlock[],
  parsed: ParsedTask,
  errors: LinearTaskValidationFinding[],
) {
  const repositoryChange = parsed.metadata.get("Repository change") ?? "";
  const issueKind = parsed.metadata.get("Issue kind") ?? "";
  const commands = verificationBlocks.flatMap((block) =>
    extractFencedCodeBlocks(block.body)
      .filter((candidate) => candidate.info === "bash")
      .flatMap((candidate) =>
        parseShellCommands(candidate.content, DEFAULT_LINEAR_TASK_REPO_ROOT),
      ),
  );
  if (repositoryChange === "yes") {
    const rawCommands = commands.map((command) => command.raw);
    const families = {
      "focused path-bearing test": rawCommands.some((raw) => {
        if (!/\b(?:vitest|jest|pytest|playwright\s+test)\b/i.test(raw)) {
          return false;
        }
        return extractCommandPathReferences(raw).some(({ repositoryPath }) =>
          /(?:^|\/)(?:test_[^/]+\.py|[^/]+\.(?:test|spec)\.(?:ts|tsx|js|mjs|cjs)|__tests__\/[^/]+\.(?:ts|tsx|js|mjs|cjs))$/i.test(
            repositoryPath,
          ),
        );
      }),
      lint: rawCommands.some((raw) =>
        /^pnpm(?:\s+run)?\s+lint(?:\s|$)/.test(raw),
      ),
      typecheck: rawCommands.some((raw) =>
        /^pnpm(?:\s+run)?\s+typecheck(?:\s|$)/.test(raw),
      ),
      "broad test/build": rawCommands.some((raw) =>
        /^pnpm(?:\s+run)?\s+(?:test|build)\s*$/.test(raw),
      ),
      "mainline closeout": rawCommands.some((raw) =>
        /^pnpm(?:\s+run)?\s+mainline:closeout:check(?:\s|$)/.test(raw),
      ),
    };
    const missing = Object.entries(families)
      .filter(([, present]) => !present)
      .map(([family]) => family);
    if (missing.length > 0) {
      addFinding(
        errors,
        "repository_verification_family_missing",
        `Every repository issue must include focused assertion proof, lint, typecheck, an appropriate broad test/build, and mainline closeout; missing: ${missing.join(", ")}.`,
      );
    }
    return;
  }
  const readbacks = verificationBlocks.flatMap((block) =>
    extractFencedCodeBlocks(block.body).flatMap((candidate) =>
      extractConnectorReadbacks(candidate.content),
    ),
  );
  if (!readbacks.some((readback) => /\bLinear\b/i.test(readback.system))) {
    addFinding(
      errors,
      "no_repository_linear_readback_missing",
      "Repository change `no` requires a concrete authenticated Linear terminal read-back.",
    );
  }
  if (
    issueKind !== "coordination_container" &&
    !readbacks.some(
      (readback) =>
        !/\bLinear\b/i.test(readback.system) &&
        isConcreteConnectorReadback(readback, parsed),
    )
  ) {
    addFinding(
      errors,
      "no_repository_provider_readback_missing",
      "External-state-only work requires at least one concrete authenticated read-back tied to a declared non-Linear provider.",
    );
  }
  if (
    issueKind === "coordination_container" &&
    readbacks.some((readback) => !/\bLinear\b/i.test(readback.system))
  ) {
    addFinding(
      errors,
      "coordination_provider_readback",
      "A coordination_container may read back Linear child/relation state only and must not claim provider operations.",
    );
  }
}

function validateCoordinationChildContract(
  parsed: ParsedTask,
  errors: LinearTaskValidationFinding[],
) {
  const dependencies =
    parsed.sections.get(
      "Dependencies, ownership boundaries, relations, and non-goals",
    ) ?? "";
  const childRows = [
    ...dependencies.matchAll(/^\s*\|\s*`?(OVE-\d+)`?\s*\|([^\n]+)\|\s*$/gm),
  ];
  const rawChildIds = childRows.flatMap((match) =>
    match[1] ? [match[1]] : [],
  );
  const childIds = [...new Set(rawChildIds)];
  const self = parsed.metadata.get("Issue identifier") ?? "";
  if (
    childIds.length === 0 ||
    childIds.includes(self) ||
    childIds.length !== rawChildIds.length
  ) {
    addFinding(
      errors,
      "coordination_child_inventory",
      "A coordination_container must contain at least one unique concrete child OVE-### table row distinct from the container itself.",
    );
  }
  for (const [index, row] of childRows.entries()) {
    const fields = (row[2] ?? "").split("|").map((field) => field.trim());
    if (
      fields.length !== 4 ||
      fields.some(
        (field) => !field || /\{\{|\b(?:TBD|TODO|unknown)\b/i.test(field),
      ) ||
      !/\b(?:blocked by|blocks|related)\b/i.test(fields[1] ?? "") ||
      !/\bDone\b/i.test(fields[3] ?? "") ||
      !/\breceipt\b/i.test(fields[3] ?? "")
    ) {
      addFinding(
        errors,
        "coordination_child_row",
        `Coordination child row ${index + 1} must define outcome, relation/direction, concrete owner, and a Done plus immutable receipt terminal contract.`,
      );
    }
  }
  if (!/^- Integration criterion:\s*\S.{8,}$/im.test(dependencies)) {
    addFinding(
      errors,
      "coordination_integration_criterion",
      "Coordination dependencies must define a concrete `Integration criterion:` field.",
    );
  }
  if (!/^- DAG proof:\s*\S.{8,}$/im.test(dependencies)) {
    addFinding(
      errors,
      "coordination_dag_proof",
      "Coordination dependencies must define a concrete `DAG proof:` field.",
    );
  }
  const coverageSections = [
    "Measurable acceptance criteria",
    "Required test and fault matrix",
    "Verification commands and required evidence",
    "Delivery, exact-SHA proof, and Linear closeout",
  ];
  for (const childId of childIds) {
    if (
      coverageSections.some(
        (heading) =>
          !new RegExp(`\\b${escapeRegExp(childId)}\\b`).test(
            parsed.sections.get(heading) ?? "",
          ),
      )
    ) {
      addFinding(
        errors,
        "coordination_child_uncovered",
        `${childId} must be named in acceptance, fault-matrix, verification read-back, and delivery closeout coverage.`,
      );
    }
  }
}

function validateLocaleMatrix(
  source: string,
  localeScope: string,
  errors: LinearTaskValidationFinding[],
) {
  if (localeScope === "unchanged") {
    requireTerms(
      source,
      ["unchanged", "proof"],
      "locale_matrix_contract",
      errors,
    );
    return;
  }
  const line = source.match(/\bLocale matrix:\s*([^\n]+)/i)?.[1] ?? "";
  const actual = uniqueMatches(line, /`([a-z]{2})`/g, 1).sort();
  const expected: Record<string, string[]> = {
    shared: ["bg", "ru", "uk"],
    "ukraine-only": ["uk"],
    bulgaria: ["bg", "ru"],
  };
  if (!arraysEqual(actual, expected[localeScope] ?? [])) {
    addFinding(
      errors,
      "locale_matrix_contract",
      `Locale matrix for ${localeScope} must contain exactly these backticked locale tokens: ${(expected[localeScope] ?? []).join(", ")}.`,
    );
  }
  if (
    localeScope === "ukraine-only" &&
    !/\b(?:no|without|absent)\b[^.\n]{0,60}\blanguage control\b/i.test(line)
  ) {
    addFinding(
      errors,
      "locale_matrix_control_contract",
      "Ukraine-only locale scope must prove that no language control is rendered.",
    );
  }
}

function hasAffirmativeRepositoryDelivery(source: string): boolean {
  return source.split(/[.;\n]+/).some((clause) => {
    if (
      !/\b(?:create|open|push|merge|use|start (?:from|on)|commit to|submit|raise|land|publish|cut)\b[^\n]{0,100}\b(?:feature branch|branch|commit|PR|pull request)\b/i.test(
        clause,
      )
    ) {
      return false;
    }
    return !(
      /\b(?:no|not|never|without|forbid(?:s|den)?|must not|do not|zero)\b[^\n]{0,80}\b(?:create|open|push|merge|use|submit|raise|land|publish|cut|branch|commit|PR|pull request)\b/i.test(
        clause,
      ) ||
      /\b(?:create|open|make)\s+no\s+(?:branch|commit|PR|pull request)\b/i.test(
        clause,
      )
    );
  });
}

function hasAffirmativeProviderEffect(source: string): boolean {
  return source
    .split(/[.;\n]+/)
    .some(
      (clause) =>
        /\b(?:apply|perform|create|trigger|mutate|execute|publish|change)\b[^\n]{0,100}\bprovider (?:effect|mutation|action|change)\b/i.test(
          clause,
        ) &&
        !/\b(?:no|not|never|without|forbid(?:s|den)?|must not|do not|zero)\b[^\n]{0,80}\b(?:apply|perform|create|trigger|mutate|execute|publish|change|provider effect|provider mutation|provider action|provider change)\b/i.test(
          clause,
        ),
    );
}

function extractReceiptField(
  receipt: string,
  label: string,
): string | undefined {
  return receipt
    .match(
      new RegExp(`(?:^|;)\\s*${escapeRegExp(label)}:\\s*([^;]+)`, "i"),
    )?.[1]
    ?.trim();
}

function isNonFutureIsoTimestamp(value: string): boolean {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/,
  );
  if (!match) {
    return false;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.valueOf() > Date.now()) {
    return false;
  }
  const expectedPrefix = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`;
  return parsed.toISOString().startsWith(expectedPrefix);
}

function validateCsvValues(
  label: string,
  values: string[],
  allowed: ReadonlySet<string>,
  errors: LinearTaskValidationFinding[],
) {
  if (values.length === 0) {
    addFinding(errors, "metadata_list_empty", `${label} cannot be empty.`);
    return;
  }

  for (const value of values) {
    if (!allowed.has(value)) {
      addFinding(
        errors,
        "metadata_list_value",
        `${label} contains unsupported value \`${value}\`; allowed: ${[...allowed].join(", ")}.`,
      );
    }
  }
}

function requireValues(
  actual: string[],
  required: string[],
  code: string,
  errors: LinearTaskValidationFinding[],
) {
  for (const value of required) {
    if (!actual.includes(value)) {
      addFinding(errors, code, `Touches must include \`${value}\`.`);
    }
  }
}

function requireTerms(
  source: string,
  terms: string[],
  code: string,
  errors: LinearTaskValidationFinding[],
) {
  for (const term of terms) {
    if (!source.toLowerCase().includes(term.toLowerCase())) {
      addFinding(
        errors,
        code,
        `Task contract must explicitly define \`${term}\`.`,
      );
    }
  }
}

function requirePositiveTerms(
  source: string,
  terms: string[],
  code: string,
  errors: LinearTaskValidationFinding[],
) {
  const clauses = source.split(/[.;\n]+/);
  const negativePattern =
    /\b(?:unknown|unavailable|absent|missing|undefined|impossible|forbidden|unverified|unredacted|not performed|not verified|not idempotent|not redacted|non-idempotent)\b/i;
  for (const term of terms) {
    const matching = clauses.filter((clause) =>
      clause.toLowerCase().includes(term.toLowerCase()),
    );
    if (
      matching.length === 0 ||
      matching.every((clause) => negativePattern.test(clause))
    ) {
      addFinding(
        errors,
        code,
        `Task contract must affirmatively define \`${term}\`; an unknown, unavailable, missing, forbidden, or non-idempotent clause does not satisfy the gate.`,
      );
    }
  }
}

function requireOneOfPositiveTerms(
  source: string,
  terms: string[],
  code: string,
  errors: LinearTaskValidationFinding[],
) {
  const clauses = source.split(/[.;\n]+/);
  const negativePattern =
    /\b(?:unknown|unavailable|absent|missing|undefined|impossible|forbidden|unverified|not verified)\b/i;
  if (
    !terms.some((term) =>
      clauses.some(
        (clause) =>
          clause.toLowerCase().includes(term.toLowerCase()) &&
          !negativePattern.test(clause),
      ),
    )
  ) {
    addFinding(
      errors,
      code,
      `Task contract must affirmatively define one of: ${terms.join(", ")}.`,
    );
  }
}

function requireOneOfTerms(
  source: string,
  terms: string[],
  code: string,
  errors: LinearTaskValidationFinding[],
) {
  if (
    !terms.some((term) => source.toLowerCase().includes(term.toLowerCase()))
  ) {
    addFinding(
      errors,
      code,
      `Task contract must explicitly define one of: ${terms.join(", ")}.`,
    );
  }
}

function requireText(
  source: string,
  expected: string,
  code: string,
  message: string,
  errors: LinearTaskValidationFinding[],
) {
  if (!source.includes(expected)) addFinding(errors, code, message);
}

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => unwrapBackticks(item.trim()))
    .filter(Boolean);
}

function unwrapBackticks(value: string): string {
  return value.replace(/^`([^`]*)`$/, "$1").trim();
}

function uniqueMatches(
  source: string,
  pattern: RegExp,
  captureIndex = 0,
): string[] {
  return [
    ...new Set(
      [...source.matchAll(pattern)]
        .map((match) => match[captureIndex])
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

function arraysEqual(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addFinding(
  findings: LinearTaskValidationFinding[],
  code: string,
  message: string,
) {
  findings.push({ code, message });
}

type CliOptions = {
  file?: string;
  stdin: boolean;
  phase: LinearTaskValidationPhase;
  json: boolean;
  expectedSha256?: string;
};

export function parseLinearTaskCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = { stdin: false, phase: "final", json: false };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") {
      continue;
    } else if (argument === "--file") {
      const file = argv[index + 1];
      if (!file || file.startsWith("--")) {
        throw new Error("--file requires a path.");
      }
      options.file = file;
      index += 1;
    } else if (argument === "--stdin") {
      options.stdin = true;
    } else if (argument === "--phase") {
      const phase = argv[index + 1];
      if (phase !== "template" && phase !== "final") {
        throw new Error("--phase must be template or final.");
      }
      options.phase = phase;
      index += 1;
    } else if (argument === "--json") {
      options.json = true;
    } else if (argument === "--expected-sha256") {
      const expectedSha256 = argv[index + 1];
      if (!expectedSha256 || expectedSha256.startsWith("--")) {
        throw new Error("--expected-sha256 requires a digest.");
      }
      options.expectedSha256 = expectedSha256;
      index += 1;
    } else if (argument === "--help" || argument === "-h") {
      throw new Error(
        "Usage: pnpm linear:task:check -- (--file <path> | --stdin) [--phase template|final] [--expected-sha256 <digest>] [--json]",
      );
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (Boolean(options.file) === options.stdin) {
    throw new Error("Provide exactly one of --file <path> or --stdin.");
  }
  return options;
}

async function runCli() {
  if (
    process.argv
      .slice(2)
      .some((argument) => ["--help", "-h"].includes(argument))
  ) {
    console.log(
      "Usage: pnpm linear:task:check -- (--file <path> | --stdin) [--phase template|final] [--expected-sha256 <digest>] [--json]",
    );
    return;
  }

  let options: CliOptions;
  try {
    options = parseLinearTaskCliArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }

  let source: string;
  let label: string;
  try {
    if (options.file) {
      const cwdPath = path.resolve(process.cwd(), options.file);
      const repoPath = path.resolve(
        DEFAULT_LINEAR_TASK_REPO_ROOT,
        options.file,
      );
      const resolvedPath = existsSync(cwdPath) ? cwdPath : repoPath;
      source = await readFile(resolvedPath, "utf8");
      label = resolvedPath;
    } else {
      source = await readStdin();
      label = "stdin";
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }

  const report = validateLinearAgentTask(source, {
    phase: options.phase,
    repoRoot: DEFAULT_LINEAR_TASK_REPO_ROOT,
    checkRepositoryEvidence: options.phase === "final",
    expectedSha256: options.expectedSha256,
  });
  if (options.json) {
    console.log(JSON.stringify({ source: label, ...report }, null, 2));
  } else {
    const status = report.valid ? "PASS" : "FAIL";
    console.log(
      `Linear task contract ${status}: ${label} (${report.phase}, sha256:${report.sha256})`,
    );
    for (const warning of report.warnings) {
      console.warn(`WARN [${warning.code}] ${warning.message}`);
    }
    for (const error of report.errors) {
      console.error(`ERROR [${error.code}] ${error.message}`);
    }
  }

  if (!report.valid) process.exitCode = 1;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  void runCli();
}
