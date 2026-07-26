/**
 * OVE-225 read-only inventory of existing `job_queue` journal payloads.
 *
 * Counts and reason classes only: no payload value, journal title or body,
 * email, media object key, signed URL, or precise-location text may ever reach
 * a report produced here (AGENTS.md hard rules 1 and 7). The report is the
 * approval artifact the maintainer needs before the two new CHECK constraints
 * can be promoted from `not valid` to `validate constraint`.
 */

import { JOB_QUEUE_PAYLOAD_UUID_PATTERN, payloadContractFor } from "./job-queue-manifest";

export const JOB_QUEUE_INVENTORY_KINDS = [
  "journal_entry_index",
  "journal_entry_unindex",
] as const;

export type JobQueueInventoryKind =
  (typeof JOB_QUEUE_INVENTORY_KINDS)[number];

export const JOB_QUEUE_INVENTORY_REASON_CLASSES = [
  "conforming",
  "missing_required_key",
  "unexpected_key",
  "non_string_value",
  "non_uuid_value",
] as const;

export type JobQueueInventoryReasonClass =
  (typeof JOB_QUEUE_INVENTORY_REASON_CLASSES)[number];

const UUID_SQL_PATTERN =
  "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

const JOURNAL_KEYS_SQL = "array['kind', 'journalEntryId', 'userId']::text[]";

export const JOB_QUEUE_PAYLOAD_INVENTORY_SQL = `
select
  payload->>'kind' as kind,
  case
    when not (payload ?& ${JOURNAL_KEYS_SQL}) then 'missing_required_key'
    when payload - ${JOURNAL_KEYS_SQL} <> '{}'::jsonb then 'unexpected_key'
    when jsonb_typeof(payload->'journalEntryId') <> 'string'
      or jsonb_typeof(payload->'userId') <> 'string' then 'non_string_value'
    when payload->>'journalEntryId' !~* '${UUID_SQL_PATTERN}'
      or payload->>'userId' !~* '${UUID_SQL_PATTERN}' then 'non_uuid_value'
    else 'conforming'
  end as reason_class,
  count(*)::text as row_count
from job_queue
where jsonb_typeof(payload) = 'object'
  and payload->>'kind' in ('journal_entry_index', 'journal_entry_unindex')
group by 1, 2
order by 1, 2
`.trim();

/** Fails closed if the inventory statement ever stops being read-only. */
export function assertJobQueueInventorySqlIsSelectOnly(
  sql: string = JOB_QUEUE_PAYLOAD_INVENTORY_SQL,
): void {
  const normalized = sql.toLowerCase();
  if (!normalized.startsWith("select")) {
    throw new Error("job queue payload inventory SQL must start with select");
  }
  for (const forbidden of [
    "insert",
    "update ",
    "delete",
    "drop",
    "alter",
    "truncate",
    "grant",
    "create",
    "validate constraint",
  ]) {
    if (normalized.includes(forbidden)) {
      throw new Error(
        `job queue payload inventory SQL must be read-only (found ${forbidden.trim()})`,
      );
    }
  }
}

export interface JobQueueInventoryRow {
  kind: string;
  reasonClass: string;
  rowCount: number;
}

export interface JobQueueInventoryReport {
  kinds: {
    kind: string;
    total: number;
    counts: Record<JobQueueInventoryReasonClass, number>;
  }[];
  violations: number;
  total: number;
}

export function buildJobQueueInventoryReport(
  rows: readonly JobQueueInventoryRow[],
): JobQueueInventoryReport {
  const kinds = JOB_QUEUE_INVENTORY_KINDS.map((kind) => {
    const counts = Object.fromEntries(
      JOB_QUEUE_INVENTORY_REASON_CLASSES.map((reasonClass) => [
        reasonClass,
        rows
          .filter((row) => row.kind === kind && row.reasonClass === reasonClass)
          .reduce((sum, row) => sum + row.rowCount, 0),
      ]),
    ) as Record<JobQueueInventoryReasonClass, number>;

    return {
      kind,
      total: Object.values(counts).reduce((sum, count) => sum + count, 0),
      counts,
    };
  });

  const violations = kinds.reduce(
    (sum, kind) => sum + (kind.total - kind.counts.conforming),
    0,
  );

  return {
    kinds,
    violations,
    total: kinds.reduce((sum, kind) => sum + kind.total, 0),
  };
}

export function formatJobQueueInventoryReport(
  report: JobQueueInventoryReport,
  context: { environment: string; dryRun: boolean; timeoutMs: number },
): string {
  const lines = [
    "OVE-225 job_queue journal payload inventory (read-only, counts only)",
    `environment=${context.environment} dry_run=${context.dryRun} timeout_ms=${context.timeoutMs}`,
  ];

  for (const kind of report.kinds) {
    const counts = JOB_QUEUE_INVENTORY_REASON_CLASSES.map(
      (reasonClass) => `${reasonClass}=${kind.counts[reasonClass]}`,
    ).join(" ");
    lines.push(`${kind.kind}: total=${kind.total} ${counts}`);
  }

  lines.push(`violations=${report.violations}`);
  lines.push(
    report.violations === 0
      ? "constraint validation may be proposed to the maintainer"
      : "constraint validation is blocked; reopen a disposition issue",
  );

  return lines.join("\n");
}

export type DeadlineOutcome<T> =
  | { status: "completed"; value: T }
  | { status: "timed_out"; timeoutMs: number };

/**
 * WAIT-01: a slow Postgres query can never wedge the operator command. The
 * caller always gets a bounded receipt within `timeoutMs`, and the CLI stays
 * usable — no unbounded poll, no retry loop.
 */
export async function runWithDeadline<T>(
  work: () => Promise<T>,
  timeoutMs: number,
): Promise<DeadlineOutcome<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<DeadlineOutcome<T>>((resolve) => {
    timer = setTimeout(
      () => resolve({ status: "timed_out", timeoutMs }),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([
      work().then((value) => ({ status: "completed", value }) as const),
      deadline,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Declared identifier keys for a journal kind, for report headers only. */
export function inventoryContractKeys(kind: JobQueueInventoryKind): string[] {
  return [...(payloadContractFor("matching", kind)?.requiredKeys ?? [])];
}

export { JOB_QUEUE_PAYLOAD_UUID_PATTERN };
