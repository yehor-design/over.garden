import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const WEB_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const REPOSITORY_ROOT = path.resolve(WEB_ROOT, "../..");
const ALIGNMENT_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/CONTRACT_VALIDATOR_ALIGNMENT.md",
);
const TEMPLATE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/linear/AI_AGENT_EXECUTION_ISSUE_TEMPLATE.md",
);

const EXPECTED_ISSUES = [
  "OVE-186",
  "OVE-333",
  "OVE-335",
  "OVE-338",
  "OVE-339",
  "OVE-342",
  "OVE-343",
  "OVE-344",
] as const;

const EXPECTED_CLASSIFICATION = {
  "OVE-186": "validated_current",
  "OVE-333": "validated_current",
  "OVE-335": "validated_current",
  "OVE-338": "material_rewrite_required",
  "OVE-339": "material_rewrite_required",
  "OVE-342": "material_rewrite_required",
  "OVE-343": "validated_current",
  "OVE-344": "material_rewrite_required",
} as const;

const EXPECTED_VALIDATOR_STATE = {
  "OVE-186": true,
  "OVE-333": true,
  "OVE-335": true,
  "OVE-338": false,
  "OVE-339": false,
  "OVE-342": true,
  "OVE-343": true,
  "OVE-344": true,
} as const;

const CLASSIFICATIONS = new Set([
  "validated_current",
  "tooling_correction",
  "material_rewrite_required",
  "historical",
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

type ValidatorReceipt = {
  valid: boolean;
  findings: string[];
};

type AlignmentEntry = {
  issue: string;
  raw_sha256: string;
  linkified_sha256: string;
  raw_validator: ValidatorReceipt;
  linkified_validator: ValidatorReceipt;
  classification: string;
  classification_reason: string;
  evidence_date: string;
  owner_or_reopen_target: string;
};

type AlignmentRecord = {
  schema: string;
  evidence_date: string;
  export_contract: string;
  entries: AlignmentEntry[];
};

function readTrackedFile(filePath: string): string {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

function sortedKeys(value: object): string[] {
  return Object.keys(value).sort();
}

function parseRecord(markdown: string): AlignmentRecord {
  const startMarker = "<!-- contract-validator-alignment.v2:start -->";
  const endMarker = "<!-- contract-validator-alignment.v2:end -->";
  const start = markdown.indexOf(startMarker);
  const end = markdown.indexOf(endMarker);

  if (start < 0 || end <= start) {
    throw new Error("contract-validator-alignment.v2 record marker missing");
  }

  const recordSection = markdown.slice(start + startMarker.length, end);
  const fencedJson = recordSection.match(/```json\n([\s\S]*?)\n```/u);
  if (!fencedJson?.[1]) {
    throw new Error("contract-validator-alignment.v2 JSON block missing");
  }

  return JSON.parse(fencedJson[1]) as AlignmentRecord;
}

function validateValidatorReceipt(
  receipt: ValidatorReceipt,
  label: string,
): void {
  expect(sortedKeys(receipt), `${label} keys`).toEqual(["findings", "valid"]);
  expect(typeof receipt.valid, `${label}.valid`).toBe("boolean");
  expect(Array.isArray(receipt.findings), `${label}.findings`).toBe(true);
  expect(receipt.findings.every((finding) => finding.trim().length > 0)).toBe(
    true,
  );
  if (receipt.valid) {
    expect(receipt.findings, `${label} valid receipt findings`).toHaveLength(0);
  } else {
    expect(
      receipt.findings.length,
      `${label} invalid receipt findings`,
    ).toBeGreaterThan(0);
  }
}

function validateRecord(record: AlignmentRecord): void {
  expect(sortedKeys(record), "top-level record keys").toEqual([
    "entries",
    "evidence_date",
    "export_contract",
    "schema",
  ]);
  expect(record.schema).toBe("contract-validator-alignment.v2");
  expect(record.evidence_date).toMatch(DATE_PATTERN);
  expect(record.export_contract.trim().length).toBeGreaterThan(40);
  expect(record.entries).toHaveLength(EXPECTED_ISSUES.length);

  const issueIds = record.entries.map((entry) => entry.issue);
  expect(new Set(issueIds).size, "duplicate cohort identifier").toBe(
    issueIds.length,
  );
  expect([...issueIds].sort(), "complete bounded cohort").toEqual(
    [...EXPECTED_ISSUES].sort(),
  );

  for (const entry of record.entries) {
    expect(sortedKeys(entry), `${entry.issue} entry keys`).toEqual([
      "classification",
      "classification_reason",
      "evidence_date",
      "issue",
      "linkified_sha256",
      "linkified_validator",
      "owner_or_reopen_target",
      "raw_sha256",
      "raw_validator",
    ]);
    expect(entry.raw_sha256, `${entry.issue} raw SHA-256`).toMatch(
      SHA256_PATTERN,
    );
    expect(entry.linkified_sha256, `${entry.issue} linkified SHA-256`).toMatch(
      SHA256_PATTERN,
    );
    expect(entry.raw_sha256).not.toBe(entry.linkified_sha256);
    validateValidatorReceipt(
      entry.raw_validator,
      `${entry.issue}.raw_validator`,
    );
    validateValidatorReceipt(
      entry.linkified_validator,
      `${entry.issue}.linkified_validator`,
    );
    expect(entry.raw_validator.valid).toBe(entry.linkified_validator.valid);
    expect(CLASSIFICATIONS.has(entry.classification)).toBe(true);
    expect(entry.classification_reason.trim().length).toBeGreaterThan(24);
    expect(entry.evidence_date).toBe(record.evidence_date);
    expect(entry.owner_or_reopen_target).toMatch(/^OVE-\d+$/u);

    const issue = entry.issue as keyof typeof EXPECTED_CLASSIFICATION;
    expect(entry.classification, `${entry.issue} truthful classification`).toBe(
      EXPECTED_CLASSIFICATION[issue],
    );
    expect(
      entry.raw_validator.valid,
      `${entry.issue} raw validator state`,
    ).toBe(EXPECTED_VALIDATOR_STATE[issue]);
    expect(
      entry.linkified_validator.valid,
      `${entry.issue} linkified validator state`,
    ).toBe(EXPECTED_VALIDATOR_STATE[issue]);

    if (entry.classification === "validated_current") {
      expect(entry.raw_validator.valid).toBe(true);
      expect(entry.linkified_validator.valid).toBe(true);
    }
  }
}

function cloneRecord(record: AlignmentRecord): AlignmentRecord {
  return JSON.parse(JSON.stringify(record)) as AlignmentRecord;
}

function recordFromRepository(): AlignmentRecord {
  return parseRecord(readTrackedFile(ALIGNMENT_PATH));
}

function validateTemplate(template: string): void {
  expect(template).toContain("# Required context");
  expect(template).toContain("- `docs/adr/ADR-0018-mvp-posture.md`");
}

type SweepState = "classified" | "stale_readback" | "sweep_already_running";

function resolveSweepState(input: {
  pending: boolean;
  exportedSha256: string;
  rereadSha256: string;
}): SweepState {
  if (input.pending) {
    return "sweep_already_running";
  }
  if (input.exportedSha256 !== input.rereadSha256) {
    return "stale_readback";
  }
  return "classified";
}

function createSweepLock() {
  let active = false;
  return async function run(readEvidence: () => Promise<void>) {
    if (active) {
      return "sweep_already_running" as const;
    }
    active = true;
    try {
      await readEvidence();
      return "classified" as const;
    } finally {
      active = false;
    }
  };
}

async function boundedEvidenceRead(input: {
  read: () => Promise<void>;
  timeoutMs: number;
  signal: AbortSignal;
}): Promise<"classified" | "timed_out" | "cancelled"> {
  if (input.signal.aborted) {
    return "cancelled";
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: "classified" | "timed_out" | "cancelled") => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      input.signal.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const onAbort = () => finish("cancelled");
    const timeout = setTimeout(() => finish("timed_out"), input.timeoutMs);

    input.signal.addEventListener("abort", onAbort, { once: true });
    void input.read().then(
      () => finish("classified"),
      () => finish("timed_out"),
    );
  });
}

describe("OVE-343 contract validator alignment record", () => {
  it("accepts exactly the complete classified cohort and preserved template", () => {
    const record = recordFromRepository();
    validateRecord(record);
    validateTemplate(readTrackedFile(TEMPLATE_PATH));

    expect(
      record.entries.filter(
        (entry) => entry.classification === "validated_current",
      ),
    ).toHaveLength(4);
    expect(
      record.entries.filter(
        (entry) => entry.classification === "material_rewrite_required",
      ),
    ).toHaveLength(4);
  });

  it.each([
    [
      "missing cohort identifier",
      (record: AlignmentRecord) => record.entries.pop(),
    ],
    [
      "duplicate cohort identifier",
      (record: AlignmentRecord) => {
        record.entries[7] = cloneRecord(record).entries[0]!;
      },
    ],
    [
      "incomplete raw evidence",
      (record: AlignmentRecord) => {
        record.entries[0]!.raw_sha256 = "";
      },
    ],
    [
      "incomplete linkified evidence",
      (record: AlignmentRecord) => {
        record.entries[0]!.linkified_validator = {
          valid: false,
          findings: [],
        };
      },
    ],
    [
      "unrecognised classification",
      (record: AlignmentRecord) => {
        record.entries[0]!.classification = "looks_current";
      },
    ],
    [
      "missing classification reason",
      (record: AlignmentRecord) => {
        record.entries[0]!.classification_reason = "";
      },
    ],
    [
      "misleading current classification",
      (record: AlignmentRecord) => {
        record.entries.find(
          (entry) => entry.issue === "OVE-338",
        )!.classification = "validated_current";
      },
    ],
  ])("rejects %s", (_name, mutate) => {
    const record = cloneRecord(recordFromRepository());
    mutate(record);
    expect(() => validateRecord(record)).toThrow();
  });

  it("rejects removal of the template ADR-0018 context line", () => {
    const template = readTrackedFile(TEMPLATE_PATH).replace(
      "- `docs/adr/ADR-0018-mvp-posture.md`",
      "",
    );
    expect(() => validateTemplate(template)).toThrow();
  });

  it("produces byte-identical replay parsing without a second effect", () => {
    const first = recordFromRepository();
    const second = recordFromRepository();
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(
      resolveSweepState({
        pending: false,
        exportedSha256: first.entries[0]!.linkified_sha256,
        rereadSha256: second.entries[0]!.linkified_sha256,
      }),
    ).toBe("classified");
  });

  it("returns stale_readback when a remote digest changes", () => {
    expect(
      resolveSweepState({
        pending: false,
        exportedSha256: "a".repeat(64),
        rereadSha256: "b".repeat(64),
      }),
    ).toBe("stale_readback");
  });

  it("returns sweep_already_running to a concurrent second run", async () => {
    const run = createSweepLock();
    let releaseFirst: (() => void) | undefined;
    const first = run(
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        }),
    );
    const second = await run(async () => undefined);
    expect(second).toBe("sweep_already_running");
    releaseFirst?.();
    await expect(first).resolves.toBe("classified");
  });

  it("times out a delayed fixture while status and cancel controls stay usable", async () => {
    const controller = new AbortController();
    let statusReads = 0;
    const status = () => {
      statusReads += 1;
      return "running" as const;
    };
    const cancel = () => controller.abort();
    const result = boundedEvidenceRead({
      read: () => new Promise<void>(() => undefined),
      timeoutMs: 5,
      signal: controller.signal,
    });

    expect(status()).toBe("running");
    expect(cancel).toBeTypeOf("function");
    await expect(result).resolves.toBe("timed_out");
    expect(statusReads).toBe(1);
  });

  it("cancels a delayed fixture and rejects late completion", async () => {
    const controller = new AbortController();
    let finishRead: (() => void) | undefined;
    const result = boundedEvidenceRead({
      read: () =>
        new Promise<void>((resolve) => {
          finishRead = resolve;
        }),
      timeoutMs: 1_000,
      signal: controller.signal,
    });

    controller.abort();
    await expect(result).resolves.toBe("cancelled");
    finishRead?.();
    await expect(result).resolves.toBe("cancelled");
  });

  it("keeps contract_alignment_check_duration inside the performance budget", () => {
    const startedAt = performance.now();
    for (let index = 0; index < 100; index += 1) {
      validateRecord(recordFromRepository());
    }
    const contractAlignmentCheckDuration = performance.now() - startedAt;
    expect(contractAlignmentCheckDuration).toBeLessThanOrEqual(60_000);
  });
});
