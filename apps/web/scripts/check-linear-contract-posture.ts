import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const LINEAR_CONTRACT_POSTURE_VERSION =
  "ove341.linearContractPosture.v1";
export const LINEAR_CONTRACT_EXPORT_VERSION = "ove341.linearContractExport.v1";
export const LINEAR_CONTRACT_POSTURE_DEADLINE_MS = 120_000;

export const OVE341_OWNED_CONTRACT_IDS = [
  "OVE-321",
  "OVE-322",
  "OVE-323",
  "OVE-324",
  "OVE-325",
  "OVE-326",
  "OVE-250",
  "OVE-254",
  "OVE-255",
  "OVE-256",
  "OVE-257",
  "OVE-258",
  "OVE-259",
  "OVE-327",
  "OVE-328",
] as const;

export const LINEAR_CONTRACT_POSTURE_CLASSES = [
  "live_instruction",
  "recorded_measurement",
  "already_aligned",
  "out_of_scope",
] as const;

export type LinearContractPostureClass =
  (typeof LINEAR_CONTRACT_POSTURE_CLASSES)[number];
export type LinearContractPosturePhase = "before" | "after";
export type LinearContractPostureStatus =
  | "aligned"
  | "alignment_required"
  | "posture_drift"
  | "unclassified"
  | "stale_digest"
  | "timed_out"
  | "cancelled"
  | "scan_already_running";

export interface LinearContractPostureExport {
  schemaVersion: typeof LINEAR_CONTRACT_EXPORT_VERSION;
  identifier: string;
  status: string;
  expectedDescriptionSha256: string;
  description: string;
}

export interface LinearContractPostureEntry {
  identifier: string;
  anchor: string;
  class: LinearContractPostureClass;
  reason: string;
  owner?: "OVE-339";
}

export interface LinearContractPostureViolation {
  code: string;
  identifier?: string;
  anchor?: string;
}

export interface LinearContractPostureReceipt {
  version: typeof LINEAR_CONTRACT_POSTURE_VERSION;
  phase: LinearContractPosturePhase;
  status: LinearContractPostureStatus;
  contractCount: number;
  counts: Record<LinearContractPostureClass, number>;
  contracts: Array<{
    identifier: string;
    status: string;
    descriptionSha256: string;
    counts: Record<LinearContractPostureClass, number>;
  }>;
  entries: LinearContractPostureEntry[];
  durationMs: number;
  digest: string;
  violations: LinearContractPostureViolation[];
}

export interface LinearContractPostureAlignment {
  description: string;
  changeCount: number;
  changedAnchors: string[];
}

interface EvaluationOptions {
  phase: LinearContractPosturePhase;
  strictOwnedSet?: boolean;
  deadlineMs?: number;
  now?: () => number;
  signal?: AbortSignal;
}

const OWNED_CONTRACT_SET = new Set<string>(OVE341_OWNED_CONTRACT_IDS);
const OVE341_CURRENT_MAIN_BASELINE = "021c20610bce4a40e7669bd3adc3375186984239";
const TERMINAL_STATUS = /^(?:done|completed|canceled|cancelled)$/i;
const CANDIDATE_TERM =
  /fail.?closed|closed refusal|\bquarantine\b|actual.?byte|stripped derivative|original deletion|blanket noindex|\bnoindex\b|public-only|stale documents? fail|another-user|another[- ]owner[\s\S]{0,160}(?:generic|forbidden|zero data|never appears)|cross-owner[\s\S]{0,160}forbidden|stale-session|session uncertainty|negative proof|failure isolation|\bconsent\b|event version|bounded enum|actor exclusion|no content|enumeration|rotation|admin panel|format-conversion-only|PUBLIC_SURFACE_INDEXABILITY_THRESHOLD|cross-account-read exposure/i;
const CURRENT_POSTURE =
  /ADR-0018|format-conversion-only|PUBLIC_SURFACE_INDEXABILITY_THRESHOLD|accepted cross-account-read exposure|unresolved authorization, ownership, or session condition serves|positively resolved/i;
const HISTORICAL_CONTEXT =
  /historical|recorded measurement|completed run|previous(?:ly)?|prior receipt|provenance|superseded|retired vocabulary|not (?:a )?current instruction|\bexisting\b[\s\S]{0,500}\bprocessor\b|\balready\b[\s\S]{0,180}\bown/i;
const EXPLICIT_HISTORICAL_CONTEXT =
  /historical|recorded measurement|completed run|previous(?:ly)?|prior receipt|provenance|superseded|retired vocabulary|not (?:a )?current instruction/i;
const SOURCE_INGESTION_CONTEXT =
  /source family|source capture|source ingestion|rights-blocked|rights-cleared|conflict quarantine|raw source|product evidence|occurrence|taxonomy/i;
const PRECISE_LOCATION_CONTEXT =
  /precise[- ]location|exact coordinates?|location field/i;
const ANALYTICS_CONTEXT = /analytics|event|cohort|actor exclusion|consent/i;
const CLOSEOUT_CONTEXT =
  /closeout|evidence leaves|remain(?:s)? Backlog|Done|containment|approval|plan digest|provider effect/i;
const AUTH_PROVIDER_CONTEXT =
  /auth secret|credential|official provider|official library|token rotation/i;
const EVIDENCE_HYGIENE_CONTEXT =
  /observability|receipt|evidence|redact|aggregate|no content|failure isolation/i;
const UNRELATED_TERM_CONTEXT =
  /IndexedDB|database enumeration|W3C|self-edge|duplicate edge|opaque vault|Clear-Site-Data|cache name|writer-negative proof|unsupported (?:browser )?enumeration|enumeration unavailable|exclusive fence|control-registry|Dexie handles|name-only cleanup|foreign_or_orphan_retained|local cleanup control/i;

export function alignLinearContractPostureDescription(
  identifier: string,
  source: string,
  status = "Backlog",
): LinearContractPostureAlignment {
  if (!OWNED_CONTRACT_SET.has(identifier) || TERMINAL_STATUS.test(status)) {
    return { description: source, changeCount: 0, changedAnchors: [] };
  }

  const beforeSignature = structuralSignature(identifier, source);
  const lines = source.split(/\r?\n/);
  const changedAnchors: string[] = [];
  let fenced = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;

    const transformed = alignPostureLine(identifier, line);
    if (transformed !== line) {
      lines[index] = transformed;
      changedAnchors.push(`lines ${index + 1}-${index + 1}`);
    }
  }

  let description = alignMultilinePosture(identifier, lines.join("\n"));
  if (description !== lines.join("\n")) {
    changedAnchors.push("multiline posture clauses");
  }
  const postureAuthority =
    "* Posture authority (not additional scope): ADR-0018 is the current MVP posture. Relevant ambiguity uses serve under uncertainty with the accepted cross-account-read exposure; accepted images use format-conversion-only WebP delivery; public discovery uses `PUBLIC_SURFACE_INDEXABILITY_THRESHOLD`; operator capability uses in-product admin under `AdminUserRole`. Positively resolved prohibitions and the precise-location lock remain enforced.";
  if (!description.includes(postureAuthority)) {
    const protocolHeading =
      "# Exact data, state, protocol, and concurrency contract\n\n";
    if (!description.includes(protocolHeading)) {
      throw new Error(`missing_protocol_heading:${identifier}`);
    }
    description = description.replace(
      protocolHeading,
      `${protocolHeading}${postureAuthority}\n`,
    );
    changedAnchors.push("ADR-0018 posture authority");
  }
  if (
    identifier === "OVE-322" &&
    !description.includes("* Local-retirement compatibility:")
  ) {
    description = description.replace(
      postureAuthority,
      `${postureAuthority}\n* Local-retirement compatibility: the product is network-required and server-authoritative; legacy storage is a read-only retirement bridge; a new save attempted without the network resolves as \`network_unavailable_save_refused\` while the existing local source remains preserved for explicit recovery.`,
    );
    changedAnchors.push("local-retirement compatibility contract");
  }
  const contextResult = alignRequiredContext(identifier, description);
  description = contextResult.description;
  changedAnchors.push(...contextResult.changedAnchors);

  if (identifier === "OVE-322") {
    const canonResult = alignOve322CanonGate(description);
    description = canonResult.description;
    changedAnchors.push(...canonResult.changedAnchors);
  }

  const afterSignature = structuralSignature(identifier, description);
  if (beforeSignature !== afterSignature) {
    throw new Error(`posture_only_structure_drift:${identifier}`);
  }

  return {
    description,
    changeCount: changedAnchors.length,
    changedAnchors,
  };
}

export function evaluateLinearContractPosture(
  contracts: readonly LinearContractPostureExport[],
  options: EvaluationOptions,
): LinearContractPostureReceipt {
  const now = options.now ?? (() => performance.now());
  const startedAt = now();
  const deadlineMs = options.deadlineMs ?? LINEAR_CONTRACT_POSTURE_DEADLINE_MS;
  const counts = emptyCounts();
  const entries: LinearContractPostureEntry[] = [];
  const violations: LinearContractPostureViolation[] = [];
  const contractReceipts: LinearContractPostureReceipt["contracts"] = [];

  if (options.signal?.aborted) {
    return terminalReceipt("cancelled", options.phase, now() - startedAt, [
      { code: "scan_cancelled" },
    ]);
  }

  const identifiers = contracts.map(({ identifier }) => identifier);
  const duplicateIdentifiers = identifiers.filter(
    (identifier, index) => identifiers.indexOf(identifier) !== index,
  );
  for (const identifier of [...new Set(duplicateIdentifiers)].sort()) {
    violations.push({ code: "duplicate_contract", identifier });
  }
  if (
    options.strictOwnedSet !== false &&
    !sameStringSet(identifiers, OVE341_OWNED_CONTRACT_IDS)
  ) {
    violations.push({ code: "owned_contract_set_mismatch" });
  }

  const sortedContracts = [...contracts].sort((left, right) =>
    left.identifier.localeCompare(right.identifier),
  );
  for (const contract of sortedContracts) {
    if (options.signal?.aborted) {
      return terminalReceipt("cancelled", options.phase, now() - startedAt, [
        { code: "scan_cancelled" },
      ]);
    }
    if (now() - startedAt > deadlineMs) {
      return terminalReceipt("timed_out", options.phase, now() - startedAt, [
        { code: "contract_export_read_timeout" },
      ]);
    }

    const descriptionSha256 = digest(contract.description);
    if (contract.schemaVersion !== LINEAR_CONTRACT_EXPORT_VERSION) {
      violations.push({
        code: "export_version_drift",
        identifier: contract.identifier,
      });
    }
    if (
      !/^[a-f0-9]{64}$/.test(contract.expectedDescriptionSha256) ||
      descriptionSha256 !== contract.expectedDescriptionSha256
    ) {
      violations.push({
        code: "stale_description_digest",
        identifier: contract.identifier,
      });
    }

    const contractCounts = emptyCounts();
    const contractEntries = classifyContract(contract);
    for (const entry of contractEntries) {
      entries.push(entry);
      counts[entry.class] += 1;
      contractCounts[entry.class] += 1;
      if (entry.reason === "unclassified_clause") {
        violations.push({
          code: "unclassified_clause",
          identifier: entry.identifier,
          anchor: entry.anchor,
        });
      }
    }
    contractReceipts.push({
      identifier: contract.identifier,
      status: contract.status,
      descriptionSha256,
      counts: contractCounts,
    });
  }

  entries.sort((left, right) => entryKey(left).localeCompare(entryKey(right)));
  violations.sort((left, right) =>
    violationKey(left).localeCompare(violationKey(right)),
  );
  const status = resolveStatus(options.phase, counts, violations);
  const receiptDigest = digest(
    JSON.stringify({
      version: LINEAR_CONTRACT_POSTURE_VERSION,
      phase: options.phase,
      contracts: contractReceipts,
      entries,
      violations,
    }),
  );

  return {
    version: LINEAR_CONTRACT_POSTURE_VERSION,
    phase: options.phase,
    status,
    contractCount: contracts.length,
    counts,
    contracts: contractReceipts,
    entries,
    durationMs: Math.ceil(now() - startedAt),
    digest: receiptDigest,
    violations,
  };
}

export function runLinearContractPostureCheck(options: {
  directory: string;
  phase: LinearContractPosturePhase;
  strictOwnedSet?: boolean;
  injectDependencyTimeout?: boolean;
  signal?: AbortSignal;
}): LinearContractPostureReceipt {
  const lockPath = path.join(
    options.directory,
    ".ove341-contract-posture.lock",
  );
  let lockDescriptor: number | undefined;
  try {
    lockDescriptor = openSync(lockPath, "wx", 0o600);
  } catch {
    return terminalReceipt("scan_already_running", options.phase, 0, [
      { code: "scan_already_running" },
    ]);
  }

  try {
    const contracts = readExportDirectory(options.directory);
    if (options.injectDependencyTimeout) {
      let call = 0;
      return evaluateLinearContractPosture(contracts, {
        phase: options.phase,
        strictOwnedSet: options.strictOwnedSet,
        deadlineMs: 1,
        now: () => (call++ === 0 ? 0 : 2),
        signal: options.signal,
      });
    }
    return evaluateLinearContractPosture(contracts, {
      phase: options.phase,
      strictOwnedSet: options.strictOwnedSet,
      signal: options.signal,
    });
  } finally {
    if (lockDescriptor !== undefined) closeSync(lockDescriptor);
    if (existsSync(lockPath)) unlinkSync(lockPath);
  }
}

export function formatLinearContractPostureReceipt(
  receipt: LinearContractPostureReceipt,
): string {
  return JSON.stringify({
    version: receipt.version,
    phase: receipt.phase,
    status: receipt.status,
    contractCount: receipt.contractCount,
    counts: receipt.counts,
    contracts: receipt.contracts,
    entries: receipt.entries,
    durationMs: receipt.durationMs,
    digest: receipt.digest,
    violations: receipt.violations,
  });
}

export function parseLinearContractPostureArguments(
  arguments_: readonly string[],
) {
  const normalized = arguments_.filter((argument) => argument !== "--");
  let directory: string | undefined;
  let phase: LinearContractPosturePhase | undefined;
  let proveDeterminism = false;
  let injectDependencyTimeout = false;
  let strictOwnedSet = true;

  for (let index = 0; index < normalized.length; index += 1) {
    const argument = normalized[index];
    if (argument === "--directory") {
      directory = normalized[++index];
      if (!directory) throw new Error("missing_directory");
      continue;
    }
    if (argument === "--phase") {
      const value = normalized[++index];
      if (value !== "before" && value !== "after") {
        throw new Error("invalid_phase");
      }
      phase = value;
      continue;
    }
    if (argument === "--prove-determinism") {
      proveDeterminism = true;
      continue;
    }
    if (argument === "--inject-dependency-timeout") {
      injectDependencyTimeout = true;
      continue;
    }
    if (argument === "--allow-partial-set") {
      strictOwnedSet = false;
      continue;
    }
    throw new Error("unknown_argument");
  }
  if (!directory) throw new Error("missing_directory");
  if (!phase) throw new Error("missing_phase");
  return {
    directory,
    phase,
    proveDeterminism,
    injectDependencyTimeout,
    strictOwnedSet,
  };
}

function classifyContract(
  contract: LinearContractPostureExport,
): LinearContractPostureEntry[] {
  if (!OWNED_CONTRACT_SET.has(contract.identifier)) {
    return [
      {
        identifier: contract.identifier,
        anchor: "contract",
        class: "out_of_scope",
        reason: "owned_by_ove339",
        owner: "OVE-339",
      },
    ];
  }

  const candidates = extractCandidateSpans(contract.description);
  if (candidates.length === 0) {
    return [
      {
        identifier: contract.identifier,
        anchor: "contract",
        class: "already_aligned",
        reason: "no_posture_clause",
      },
    ];
  }
  return candidates.map(({ content, startLine, endLine }) => {
    const anchor = `lines ${startLine}-${endLine}`;
    if (TERMINAL_STATUS.test(contract.status)) {
      return {
        identifier: contract.identifier,
        anchor,
        class: "recorded_measurement" as const,
        reason: "terminal_contract_history",
      };
    }
    const classification = classifyCandidateLine(content);
    return {
      identifier: contract.identifier,
      anchor,
      class: classification.class,
      reason: classification.reason,
    };
  });
}

function classifyCandidateLine(line: string): {
  class: Exclude<LinearContractPostureClass, "out_of_scope">;
  reason: string;
} {
  if (
    HISTORICAL_CONTEXT.test(line) &&
    (EXPLICIT_HISTORICAL_CONTEXT.test(line) || !isRetiredLiveInstruction(line))
  ) {
    return { class: "recorded_measurement", reason: "historical_measurement" };
  }
  if (
    SOURCE_INGESTION_CONTEXT.test(line) &&
    /quarantine|forbidden fields|negative proof/i.test(line)
  ) {
    return { class: "already_aligned", reason: "source_ingestion_boundary" };
  }
  if (
    PRECISE_LOCATION_CONTEXT.test(line) &&
    /negative proof|forbidden fields|closed (?:error|refusal)|zero echo|absent/i.test(
      line,
    ) &&
    !/another-user|private quarantine|actual.?byte|stripped derivative|original deletion|public-only|stale documents? fail/i.test(
      line,
    )
  ) {
    return { class: "already_aligned", reason: "precise_location_boundary" };
  }
  if (
    ANALYTICS_CONTEXT.test(line) &&
    /failure isolation|consent|event version|bounded enum|actor exclusion|no content/i.test(
      line,
    ) &&
    !/another-user|private quarantine|actual.?byte|public-only|fail.?closed/i.test(
      line,
    )
  ) {
    return { class: "already_aligned", reason: "task_specific_analytics" };
  }
  if (
    CLOSEOUT_CONTEXT.test(line) &&
    /fail.?closed|closed refusal/i.test(line)
  ) {
    return { class: "already_aligned", reason: "delivery_failure_gate" };
  }
  if (
    AUTH_PROVIDER_CONTEXT.test(line) &&
    /enumeration|rotation|session/i.test(line) &&
    !/another-user|stale-session|stale session/i.test(line)
  ) {
    return { class: "already_aligned", reason: "provider_secret_boundary" };
  }
  if (UNRELATED_TERM_CONTEXT.test(line)) {
    return { class: "already_aligned", reason: "unrelated_term" };
  }
  if (EVIDENCE_HYGIENE_CONTEXT.test(line) && !isRetiredLiveInstruction(line)) {
    return { class: "already_aligned", reason: "evidence_hygiene" };
  }
  if (
    CURRENT_POSTURE.test(line) &&
    (/PUBLIC_SURFACE_INDEXABILITY_THRESHOLD/.test(line) ||
      !isRetiredLiveInstruction(line))
  ) {
    return { class: "already_aligned", reason: "adr0018_posture" };
  }
  if (isRetiredLiveInstruction(line)) {
    return { class: "live_instruction", reason: "retired_posture_instruction" };
  }
  return { class: "already_aligned", reason: "unclassified_clause" };
}

function isRetiredLiveInstruction(line: string) {
  const oldAuthorizationInstruction =
    /another[- ](?:user|owner)[\s\S]{0,240}(?:generic (?:denial|absence|refusal)|forbidden|never appears|receives `?404`? with zero data|access is generic with zero)/i.test(
      line,
    ) || /cross-owner[\s\S]{0,160}forbidden/i.test(line);
  return (
    /private quarantine|media quarantine|quarantine and derivative lifecycle|actual.?byte|stripped derivative|original deletion/i.test(
      line,
    ) ||
    /stale documents? fail.?closed|public-only (?:derived )?projection|public eligibility[\s\S]{0,160}stale removal/i.test(
      line,
    ) ||
    /\bnoindex\b/i.test(line) ||
    (oldAuthorizationInstruction &&
      !/positively resolved|unresolved authorization, ownership, or session condition/i.test(
        line,
      )) ||
    (/another-user|stale-session|stale session/i.test(line) &&
      /generic (?:denial|absence|refusal)|forbidden|refused|zero (?:data|leak|mutation|effect)|remain unchanged/i.test(
        line,
      ) &&
      !/positively resolved|unresolved authorization, ownership, or session condition/i.test(
        line,
      ))
  );
}

function extractCandidateSpans(description: string) {
  const lines = description.split(/\r?\n/);
  const spans: Array<{
    content: string;
    startLine: number;
    endLine: number;
  }> = [];
  let fenced = false;
  let startLine: number | undefined;
  let block: string[] = [];

  const flush = (endLine: number) => {
    if (startLine === undefined || block.length === 0) return;
    const content = block.join("\n");
    if (CANDIDATE_TERM.test(content)) {
      spans.push({ content, startLine, endLine });
    }
    startLine = undefined;
    block = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index];
    if (/^\s*```/.test(line)) {
      flush(lineNumber - 1);
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    if (line.trim() === "" || /^#/.test(line)) {
      flush(lineNumber - 1);
      continue;
    }
    if (startLine !== undefined && /^\s*(?:[-*+]|\d+\.)\s+/.test(line)) {
      // A neighboring list item is a new clause even without a blank line.
      flush(lineNumber - 1);
    }
    if (startLine === undefined) startLine = lineNumber;
    block.push(line);
    if (/^\|/.test(line)) flush(lineNumber);
  }
  flush(lines.length);
  return spans;
}

function alignPostureLine(identifier: string, source: string) {
  let line = source;
  const onlineMediaOwner = new Set([
    "OVE-321",
    "OVE-322",
    "OVE-323",
    "OVE-325",
    "OVE-326",
  ]).has(identifier);

  if (onlineMediaOwner) {
    line = line
      .replace(
        /Media and privacy remain fail-closed/gi,
        "Media and privacy follow ADR-0018",
      )
      .replace(/Media and search safety/gi, "Media and search posture")
      .replace(/media and search safety/gi, "media and search posture")
      .replace(
        /Originals? (?:enter|stay) (?:in )?private quarantine(?: only)?/gi,
        "Accepted image input uses format-conversion-only WebP delivery",
      )
      .replace(
        /Original bytes stay private quarantine/gi,
        "Accepted image input uses format-conversion-only WebP delivery",
      )
      .replace(/private quarantine/gi, "format-conversion-only WebP intake")
      .replace(
        /actual-byte (?:validation|verification) precedes (?:a )?stripped derivative(?: publication)?/gi,
        "conversion produces the WebP product asset",
      )
      .replace(
        /original deletion precedes public readiness/gi,
        "conversion success determines media readiness",
      )
      .replace(
        /originals are deleted after processing/gi,
        "conversion success determines media readiness",
      )
      .replace(
        /quarantine\/actual-byte\/derivative\/original lifecycle/gi,
        "ADR-0018 format-conversion-only WebP lifecycle",
      )
      .replace(
        /quarantine, actual-byte, derivative, and original-deletion rules/gi,
        "ADR-0018 format-conversion-only WebP rules",
      )
      .replace(
        /quarantine, actual-byte, derivative, and original lifecycle/gi,
        "ADR-0018 format-conversion-only WebP lifecycle",
      )
      .replace(
        /quarantine\/actual-byte\/derivative\/original/gi,
        "format-conversion-only WebP",
      )
      .replace(
        /quarantine, derivative, and original rules/gi,
        "format-conversion-only WebP rules",
      )
      .replace(
        /quarantine, derivative, original deletion, eligibility/gi,
        "format-conversion-only WebP delivery and threshold eligibility",
      )
      .replace(
        /quarantine, derivative, eligibility/gi,
        "format-conversion-only WebP delivery and threshold eligibility",
      )
      .replace(
        /closed refusal with quarantine, original, derivative, and public projection owners preserved/gi,
        "bounded refusal for positively resolved invalid or location input; format-conversion-only WebP delivery and public-projection owners preserved",
      )
      .replace(
        /original remains format-conversion-only WebP intake, verified derivative only on success, bounded cleanup/gi,
        "input remains pending until format-conversion-only WebP delivery succeeds, with bounded cleanup",
      )
      .replace(/wrong actual-byte media/gi, "unsupported image input")
      .replace(
        /wrong actual-byte or another-owner media/gi,
        "unsupported image input or positively resolved another-owner media",
      )
      .replace(
        /quarantine and public capability classes/gi,
        "format-conversion-only upload and public capability classes",
      )
      .replace(
        /quarantine and derivative lifecycle/gi,
        "format-conversion-only WebP lifecycle",
      )
      .replace(
        /quarantine\/actual-byte\/derivative/gi,
        "format-conversion-only WebP",
      )
      .replace(
        /actual-byte verification, derivative or original deletion/gi,
        "format-conversion-only WebP delivery",
      )
      .replace(
        /quarantine, actual-byte, derivative, original/gi,
        "format-conversion-only WebP delivery",
      )
      .replace(
        /quarantine, actual-byte, derivative, and original/gi,
        "format-conversion-only WebP delivery",
      );
  }

  line = line
    .replace(
      /Meilisearch is public-only and stale documents fail closed/gi,
      "public discovery uses `PUBLIC_SURFACE_INDEXABILITY_THRESHOLD`; unresolved derived rows carry an explicit quality class while positively non-public rows remain excluded from Meilisearch",
    )
    .replace(
      /public eligibility is an explicit release predicate; Meilisearch is a public-only derived projection, stale documents fail closed/gi,
      "public discovery uses `PUBLIC_SURFACE_INDEXABILITY_THRESHOLD`; Meilisearch remains a derived projection, unresolved rows are admitted with an explicit quality class while positively non-public rows remain excluded",
    )
    .replace(
      /public eligibility, public-only projection, stale removal, and Postgres(?: and |\/)Meilisearch parity remain unchanged/gi,
      "public discovery uses `PUBLIC_SURFACE_INDEXABILITY_THRESHOLD`, unresolved derived rows carry an explicit quality class, positively non-public rows remain excluded, and Postgres/Meilisearch parity remains measured",
    )
    .replace(
      /another-user enumeration returns one generic denial/gi,
      "a positively resolved another-user request returns a bounded denial, while an unresolved authorization, ownership, or session condition serves with the accepted cross-account-read exposure; positively resolved prohibitions yield",
    )
    .replace(
      /Another-user or stale-session uncertainty returns a generic denial/gi,
      "A positively resolved another-user or stale-session prohibition returns a bounded denial; an unresolved authorization, ownership, or session condition serves with the accepted cross-account-read exposure",
    )
    .replace(
      /another-user enumeration stays generic/gi,
      "a positively resolved another-user request stays bounded, while an unresolved authorization, ownership, or session condition serves with the accepted cross-account-read exposure",
    )
    .replace(
      /generic another-user enumeration remain unchanged/gi,
      "positively resolved another-user handling remains bounded, while an unresolved authorization, ownership, or session condition serves with the accepted cross-account-read exposure",
    )
    .replace(
      /another-user or unauthorized input is refused/gi,
      "a positively resolved unauthorized input is refused, while an unresolved authorization, ownership, or session condition serves with the accepted cross-account-read exposure",
    )
    .replace(
      /another-user access is forbidden/gi,
      "positively resolved another-user access remains denied; an unresolved authorization, ownership, or session condition serves with the accepted cross-account-read exposure",
    )
    .replace(
      /another-user access is not forbidden, generic, and redacted/gi,
      "an unresolved authorization, ownership, or session condition does not serve with the accepted cross-account-read exposure, or positively resolved another-user evidence is not bounded and redacted",
    )
    .replace(
      /another-user access is not forbidden\/generic\/redacted/gi,
      "an unresolved authorization, ownership, or session condition does not serve with the accepted cross-account-read exposure, or positively resolved another-user evidence is not bounded and redacted",
    )
    .replace(
      /ordinary users and stale sessions receive one generic denial/gi,
      "positively resolved ordinary users receive one bounded denial, while an unresolved authorization, ownership, or session condition serves with the accepted cross-account-read exposure; positively resolved prohibitions yield",
    )
    .replace(
      /redacted generic denial, zero leak, zero unauthorized mutation/gi,
      "positively resolved prohibition yields a redacted bounded denial and zero unauthorized mutation; an unresolved authorization, ownership, or session condition serves with the accepted cross-account-read exposure",
    )
    .replace(
      /generic absence, zero data or mutation/gi,
      "positively resolved prohibition yields bounded absence and zero unauthorized mutation; unresolved authorization, ownership, or session conditions serve with the accepted cross-account-read exposure",
    )
    .replace(
      /generic absence, zero data, zero mutation, redacted evidence/gi,
      "positively resolved prohibition yields bounded absence and zero unauthorized mutation; unresolved authorization, ownership, or session conditions serve with the accepted cross-account-read exposure; evidence stays redacted",
    )
    .replace(
      /generic refusal, zero leak or mutation/gi,
      "positively resolved prohibition yields a bounded refusal and zero unauthorized mutation; unresolved authorization, ownership, or session conditions serve with the accepted cross-account-read exposure",
    )
    .replace(
      /another user, stale document, or anonymous caller receives generic denial and zero private object evidence/gi,
      "a positively resolved another-user, stale-document, or anonymous prohibition receives a bounded denial and zero private object evidence; unresolved authorization, ownership, or session conditions serve with the accepted cross-account-read exposure",
    )
    .replace(
      /another owner receives generic absence/gi,
      "a positively resolved another-owner request receives bounded absence; an unresolved authorization, ownership, or session condition serves with the accepted cross-account-read exposure",
    );

  if (identifier === "OVE-256") {
    // Linear splits a bold span around inline code on save. Emit that canonical
    // form up front so intended and authenticated read-back digests match.
    line = line
      .replace(/\bnoindex policy\b/gi, "threshold-driven indexability policy")
      .replace(
        /thin pages stay noindex/gi,
        "each public page follows `PUBLIC_SURFACE_INDEXABILITY_THRESHOLD`",
      )
      .replace(
        /mass thin catalog templates as noindex/gi,
        "mass thin catalog templates as noindex",
      )
      .replace(
        /all source explorer and thin catalog pages are noindex and excluded from sitemap until a separate quality gate promotes them/gi,
        "every public candidate uses** `PUBLIC_SURFACE_INDEXABILITY_THRESHOLD`**; below-threshold pages are noindex and sitemap-excluded while qualifying pages are indexable",
      )
      .replace(
        /apply canonical noindex policy/gi,
        "apply the canonical `PUBLIC_SURFACE_INDEXABILITY_THRESHOLD`",
      )
      .replace(
        /Reuse canonical noindex\/sitemap policy/gi,
        "Reuse canonical `PUBLIC_SURFACE_INDEXABILITY_THRESHOLD` for robots and sitemap parity",
      )
      .replace(
        /Document public namespace, fields, credits, noindex, and promotion boundary/gi,
        "Document public namespace, fields, credits, and `PUBLIC_SURFACE_INDEXABILITY_THRESHOLD` outcomes",
      )
      .replace(
        /Extend the existing noindex, sitemap, and promotion authority/gi,
        "Use the existing `PUBLIC_SURFACE_INDEXABILITY_THRESHOLD`, sitemap, and promotion authority",
      )
      .replace(
        /remain noindex and absent from sitemaps/gi,
        "follow `PUBLIC_SURFACE_INDEXABILITY_THRESHOLD` for indexability and sitemap admission",
      )
      .replace(
        /keep noindex/gi,
        "apply `PUBLIC_SURFACE_INDEXABILITY_THRESHOLD`",
      )
      .replace(
        /every thin\/source page is noindex and absent from sitemap\/structured data/gi,
        "every public candidate's robots, sitemap, and structured-data state matches `PUBLIC_SURFACE_INDEXABILITY_THRESHOLD`",
      )
      .replace(
        /timeout, noindex, locale/gi,
        "timeout, threshold-driven indexability, locale",
      );
  }

  return line;
}

function alignMultilinePosture(identifier: string, source: string) {
  let description = source
    .replace(
      /positively resolved prohibitions yield and/g,
      "positively resolved prohibitions yield",
    )
    .replace(
      /^\* positively resolved another-user/gm,
      "* Positively resolved another-user",
    )
    .replace(
      /public-only search projections/g,
      "positively non-public search exclusions and quality-classed derived projections",
    )
    .replace(
      /require negative proof for precise location and positively non-public search exclusions and quality-classed derived projections/g,
      "prove precise location remains absent and preserve positively non-public search exclusions plus quality-classed derived projections",
    );

  if (/^OVE-32[1-6]$/.test(identifier)) {
    description = description
      .replaceAll(
        "77d1dae77be65454dba62ce6178b2157ffbaf500",
        OVE341_CURRENT_MAIN_BASELINE,
      )
      .replace(
        /^\* Evidence captured: 2026-08-(?:16|18)$/m,
        "* Evidence captured: 2026-08-20",
      )
      .replace(/observed 2026-08-(?:16|18)/g, "observed 2026-08-20")
      .replace(
        "observed\n2026-08-16 on clean current main",
        "observed\n2026-08-20 on clean current main",
      );
  }

  if (identifier === "OVE-256") {
    description = description.replace(
      "* The SEO research explicitly treats mass thin catalog templates as noindex, so public availability is not permission for sitemap or indexing promotion.",
      "* Historical research measurement (preserved verbatim): The SEO research explicitly treats mass thin catalog templates as noindex, so public availability is not permission for sitemap or indexing promotion.",
    );
  }

  if (identifier === "OVE-321" || identifier === "OVE-325") {
    description = description
      .replace(
        "** Originals enter private\n   quarantine only, conversion produces the WebP product asset,\n   conversion success determines media readiness,",
        "** Accepted image input is converted to\n   WebP for product delivery; conversion success determines media readiness,\n   while",
      )
      .replace(
        "owner without changing format-conversion-only WebP delivery deletion,",
        "owner while preserving format-conversion-only WebP delivery,",
      )
      .replace(
        "* another-user enumeration, precise-location refusal, format-conversion-only WebP intake,\n  format-conversion-only WebP delivery,",
        "* Positively resolved another-user and precise-location prohibitions,\n  format-conversion-only WebP delivery,",
      );

    if (identifier === "OVE-321") {
      description = description
        .replace(
          "exposure, the client owner writes nothing durable",
          "exposure; the client owner writes nothing durable",
        )
        .replace(
          "without echo, and another-user media or draft data never appears. A precise location\n   negative proof records refusal classes and zero echo only, and any cross-owner\n   media or draft read is forbidden.",
          "without echo; positively resolved another-user media or draft data stays absent,\n   while unresolved authorization, ownership, or session conditions serve with the accepted cross-account-read exposure. A precise-location negative proof records refusal classes and zero echo only, and positively resolved cross-owner\n   media or draft reads remain denied.",
        )
        .replace(
          "canonical transaction and outbox; public eligibility, public-only projection,\n   stale removal, and Postgres and Meilisearch parity remain unchanged.",
          "canonical transaction and outbox; public discovery uses\n   `PUBLIC_SURFACE_INDEXABILITY_THRESHOLD`, unresolved derived rows carry an explicit quality class, positively non-public rows remain excluded, and Postgres/Meilisearch parity remains measured.",
        )
        .replace(
          "a different owner receives `404` with zero data.",
          "a positively resolved different-owner request receives `404` with zero data, while an unresolved authorization, ownership, or session condition serves with the accepted cross-account-read exposure.",
        )
        .replace(
          "duplicate publish, another-owner denial,",
          "duplicate publish, positively resolved another-owner denial,",
        )
        .replace(
          "generated types, another-owner denial,",
          "generated types, positively resolved another-owner denial,",
        )
        .replace(
          "four owner contexts, generic another-owner absence,",
          "four owner contexts, positively resolved another-owner bounded absence plus unresolved-condition serving,",
        );
    } else {
      description = description
        .replace(
          "without echo, and another-user media or draft data never appears. A precise location\n   negative proof records refusal classes with zero echo, and any cross-owner media\n   or draft read is forbidden.",
          "without echo; positively resolved another-user media or draft data stays absent,\n   while unresolved authorization, ownership, or session conditions serve with the accepted cross-account-read exposure. A precise-location negative proof records refusal classes with zero echo, and positively resolved cross-owner media\n   or draft reads remain denied.",
        )
        .replace(
          "another-owner access is generic with zero data or mutation,",
          "positively resolved another-owner access is bounded with zero unauthorized mutation while unresolved authorization, ownership, or session conditions serve with the accepted cross-account-read exposure,",
        );
    }
  }

  if (identifier === "OVE-322") {
    // Linear auto-links bare issue identifiers on save; use its stable issue tag
    // in the intended payload so the read-back remains byte-identical.
    description = description
      .replace(
        "* Touches: `repository, server, ui, offline, media, auth, deployment, tests, docs`",
        "* Touches: `repository, server, ui, local-retirement, media, auth, deployment, tests, docs`",
      )
      .replace(
        "** Accepted image input uses format-conversion-only WebP delivery,\n   conversion produces the WebP product asset, originals\n   are deleted after processing, precise location negative proof returns zero",
        "** Accepted image input is converted to WebP for product delivery;\n   conversion success determines media readiness, while precise-location\n   negative proof returns zero",
      )
      .replace(
        "closed refusal; quarantine/original/derivative safety and source preservation",
        "bounded refusal for positively resolved invalid, location, or another-owner input; format-conversion-only WebP delivery and source preservation",
      )
      .replace(
        "| Package command | `smoke:legacy-device-retirement` (new) | Execute the retirement browser smoke | required |",
        '| Package command | `smoke:legacy-device-retirement` (new); `online-only:canon:check` (new) (provided by the <issue id="fc867650-efa6-441c-bb88-65738d25e311" href="https://linear.app/overgarden/issue/OVE-320/online-only-architecture-canon-retire-pwa-and-offline-capture-without">OVE-320</issue> prerequisite) | Execute the retirement browser smoke and the inherited online-only canon gate | required |',
      );
  }

  if (identifier === "OVE-323" || identifier === "OVE-326") {
    description = description
      .replace(
        "** Accepted image input uses format-conversion-only WebP delivery,\n   conversion produces the WebP product asset, original deletion\n   precedes public readiness, and public eligibility, public-only projection, stale\n   removal, and Postgres",
        "** Accepted image input is converted to WebP for product delivery,\n   and public discovery uses `PUBLIC_SURFACE_INDEXABILITY_THRESHOLD`; unresolved\n   derived rows carry an explicit quality class, positively non-public rows remain\n   excluded, and Postgres",
      )
      .replace(
        "** Accepted image input uses format-conversion-only WebP delivery,\n   conversion produces the WebP product asset, original deletion\n   precedes public readiness, and public eligibility, public-only projection,\n   stale removal, and Postgres",
        "** Accepted image input is converted to WebP for product delivery,\n   and public discovery uses `PUBLIC_SURFACE_INDEXABILITY_THRESHOLD`; unresolved\n   derived rows carry an explicit quality class, positively non-public rows remain\n   excluded, and Postgres",
      );
  }

  if (identifier === "OVE-327") {
    description = description.replace(
      "blocked and conditional source families, unknown source slugs, another-user or unauthorized input, malformed artifacts, ambiguous denominations, trade aliases, precise location, and every other forbidden field are held or refused with a closed class, a redacted receipt, negative proof that precise location is absent, and zero database, search, provider, or catalog effect",
      "blocked and conditional source families, unknown source slugs, positively resolved another-user or unauthorized input, malformed artifacts, ambiguous denominations, trade aliases, precise location, and every other forbidden field are held or refused with a closed class, a redacted receipt, negative proof that precise location is absent, and zero database, search, provider, or catalog effect; unresolved authorization, ownership, or session conditions serve with the accepted cross-account-read exposure",
    );
  }

  return description;
}

function alignRequiredContext(identifier: string, source: string) {
  const requiredContextIndex = source.indexOf("# Required context\n");
  if (requiredContextIndex < 0) {
    throw new Error(`missing_required_context:${identifier}`);
  }

  const prefix = source.slice(0, requiredContextIndex);
  const originalContext = source.slice(requiredContextIndex);
  let context = originalContext;
  const repositoryAuthority = "Repository authority:\n\n";
  if (!context.includes(repositoryAuthority)) {
    throw new Error(`missing_required_context_anchor:${identifier}`);
  }

  const onlineContract = /^OVE-32[1-6]$/.test(identifier);
  const currentPaths = onlineContract
    ? [
        "* `docs/adr/ADR-0017-online-only-product.md`",
        "* `docs/adr/ADR-0018-mvp-posture.md`",
      ]
    : ["* `docs/adr/ADR-0018-mvp-posture.md`"];
  for (const currentPath of currentPaths) {
    context = context.replace(
      new RegExp(`^${escapeRegExp(currentPath)}\\n?`, "gm"),
      "",
    );
  }
  context = context.replace(
    repositoryAuthority,
    `${repositoryAuthority}${currentPaths.join("\n")}\n`,
  );

  if (identifier === "OVE-322") {
    context = context.replace(
      "* `docs/adr/ADR-0014-agentic-stack-realignment.md`",
      "* Historical provenance only: `docs/adr/ADR-0014-agentic-stack-realignment.md`",
    );
  }

  const description = `${prefix}${context}`;
  return {
    description,
    changedAnchors:
      context === originalContext ? [] : ["required context current posture"],
  };
}

function alignOve322CanonGate(source: string) {
  let description = source;
  const changedAnchors: string[] = [];
  const verificationHeading = "# Verification commands and required evidence\n";
  const verificationIndex = description.indexOf(verificationHeading);
  if (verificationIndex < 0) {
    throw new Error("missing_verification_heading:OVE-322");
  }
  const firstFenceStart = description.indexOf("```bash\n", verificationIndex);
  const firstFenceEnd = description.indexOf("\n```", firstFenceStart + 8);
  if (firstFenceStart < 0 || firstFenceEnd < 0) {
    throw new Error("missing_first_verification_block:OVE-322");
  }
  const firstBlock = description.slice(firstFenceStart, firstFenceEnd);
  if (!firstBlock.includes("pnpm online-only:canon:check")) {
    if (!firstBlock.includes("cd apps/web\n")) {
      throw new Error("missing_first_verification_cwd:OVE-322");
    }
    const amendedBlock = firstBlock.replace(
      "cd apps/web\n",
      "cd apps/web\npnpm online-only:canon:check\n",
    );
    description = `${description.slice(0, firstFenceStart)}${amendedBlock}${description.slice(firstFenceEnd)}`;
    changedAnchors.push("first verification canon command");
  }

  const failureGate =
    "* the canon checker reports drift or an unowned `runtime_pending_child` entry;";
  if (!description.includes(failureGate)) {
    const failureIntro =
      "Do not transfer, delete, merge, deploy, or mark `Done` when:\n\n";
    if (!description.includes(failureIntro)) {
      throw new Error("missing_failure_gate_anchor:OVE-322");
    }
    description = description.replace(
      failureIntro,
      `${failureIntro}${failureGate}\n`,
    );
    changedAnchors.push("online-only canon failure gate");
  }

  return { description, changedAnchors };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function structuralSignature(identifier: string, description: string) {
  const lines = description.split(/\r?\n/);
  let fenced = false;
  const fencedLines: string[] = [];
  const headings: string[] = [];
  const identifiers: string[] = [];
  const tableShapes: string[] = [];
  const protectedNumbers: string[] = [];

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      fencedLines.push(line);
      continue;
    }
    if (fenced) {
      if (
        !(
          identifier === "OVE-322" &&
          line.trim() === "pnpm online-only:canon:check"
        )
      ) {
        fencedLines.push(line);
      }
      continue;
    }
    if (/^#/.test(line)) headings.push(line);
    identifiers.push(
      ...(line.match(/\b(?:INV|AC|VER|PERF|WAIT)-\d+\b/g) ?? []),
    );
    if (
      !/^\* (?:Baseline SHA|Evidence captured):/.test(line) &&
      !/^Audit baseline:/.test(line) &&
      !/^2026-08-(?:16|18|20) on clean current main/.test(line)
    ) {
      protectedNumbers.push(
        ...(line.match(/\b\d+(?:\.\d+)?\b/g) ?? []).filter(
          (value) =>
            value !== "0017" &&
            value !== "0018" &&
            value !== "320" &&
            value !== "341",
        ),
      );
    }
    if (/^\|/.test(line)) {
      const cells = line.split("|");
      tableShapes.push(`${cells[1]?.trim() ?? ""}:${cells.length}`);
    }
  }
  return digest(
    JSON.stringify({
      headings,
      identifiers,
      tableShapes,
      fencedLines,
      protectedNumbers,
    }),
  );
}

function readExportDirectory(directory: string): LinearContractPostureExport[] {
  return readdirSync(directory)
    .filter((filename) => /^OVE-\d+\.json$/.test(filename))
    .sort()
    .map((filename) =>
      JSON.parse(readFileSync(path.join(directory, filename), "utf8")),
    ) as LinearContractPostureExport[];
}

function resolveStatus(
  phase: LinearContractPosturePhase,
  counts: Record<LinearContractPostureClass, number>,
  violations: readonly LinearContractPostureViolation[],
): LinearContractPostureStatus {
  if (violations.some(({ code }) => code === "stale_description_digest")) {
    return "stale_digest";
  }
  if (violations.some(({ code }) => code === "unclassified_clause")) {
    return "unclassified";
  }
  if (violations.length > 0) return "posture_drift";
  if (phase === "after" && counts.live_instruction > 0) return "posture_drift";
  if (phase === "before" && counts.live_instruction > 0) {
    return "alignment_required";
  }
  return "aligned";
}

function terminalReceipt(
  status: Extract<
    LinearContractPostureStatus,
    "timed_out" | "cancelled" | "scan_already_running"
  >,
  phase: LinearContractPosturePhase,
  durationMs: number,
  violations: LinearContractPostureViolation[],
): LinearContractPostureReceipt {
  return {
    version: LINEAR_CONTRACT_POSTURE_VERSION,
    phase,
    status,
    contractCount: 0,
    counts: emptyCounts(),
    contracts: [],
    entries: [],
    durationMs: Math.ceil(durationMs),
    digest: digest(status),
    violations,
  };
}

function emptyCounts(): Record<LinearContractPostureClass, number> {
  return {
    live_instruction: 0,
    recorded_measurement: 0,
    already_aligned: 0,
    out_of_scope: 0,
  };
}

function sameStringSet(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    [...new Set(left)].sort().join("\0") ===
      [...new Set(right)].sort().join("\0")
  );
}

function digest(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function entryKey(entry: LinearContractPostureEntry) {
  return `${entry.identifier}:${entry.anchor}:${entry.class}:${entry.reason}`;
}

function violationKey(violation: LinearContractPostureViolation) {
  return `${violation.identifier ?? ""}:${violation.anchor ?? ""}:${violation.code}`;
}

function isDirectExecution() {
  const entrypoint = process.argv[1];
  return (
    entrypoint !== undefined &&
    import.meta.url === pathToFileURL(entrypoint).href
  );
}

if (isDirectExecution()) {
  try {
    const arguments_ = parseLinearContractPostureArguments(
      process.argv.slice(2),
    );
    const options = {
      directory: arguments_.directory,
      phase: arguments_.phase,
      strictOwnedSet: arguments_.strictOwnedSet,
      injectDependencyTimeout: arguments_.injectDependencyTimeout,
    };
    const first = runLinearContractPostureCheck(options);
    if (arguments_.proveDeterminism) {
      const second = runLinearContractPostureCheck(options);
      if (first.digest !== second.digest || first.status !== second.status) {
        first.status = "posture_drift";
        first.violations.push({ code: "nondeterministic_classification" });
      }
    }
    process.stdout.write(`${formatLinearContractPostureReceipt(first)}\n`);
    if (
      first.status !== "aligned" &&
      !(arguments_.phase === "before" && first.status === "alignment_required")
    ) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: "failed",
        reason: error instanceof Error ? error.message : "unknown_error",
      })}\n`,
    );
    process.exitCode = 1;
  }
}
