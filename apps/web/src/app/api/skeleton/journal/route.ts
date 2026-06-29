import { createJournalEntry, listMyRecentJournalEntries } from "@/server/journal-repository";
import { enqueueJob } from "@/server/queue";
import { requireCurrentUserId } from "@/server/auth-session";
import {
  PilotWriteAccessError,
  requireWriteEligibleRequestScope,
} from "@/server/pilot-write-access";
import { scopedToUser } from "@/server/request-scope";

export const runtime = "nodejs";

export async function GET() {
  const userId = await requireCurrentUserId();
  const entries = await listMyRecentJournalEntries(scopedToUser(userId), 10);
  return Response.json({ entries });
}

export async function POST(request: Request) {
  let scope: Awaited<ReturnType<typeof requireWriteEligibleRequestScope>>;
  try {
    scope = await requireWriteEligibleRequestScope();
  } catch (error) {
    if (error instanceof PilotWriteAccessError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    return Response.json(
      { error: "Sign in to save an entry." },
      { status: 401 },
    );
  }

  const input = (await request.json()) as {
    body?: string;
    visibility?: "private" | "public";
    clientMutationId?: string;
  };

  const entry = await createJournalEntry(scope, {
    body: input.body ?? "",
    visibility: input.visibility === "public" ? "public" : "private",
    clientMutationId: input.clientMutationId || crypto.randomUUID(),
  });

  let queuedJobId: string | null = null;
  if (entry.visibility === "public") {
    queuedJobId = await enqueueJob(
      "matching",
      {
        kind: "journal_entry_index",
        journalEntryId: entry.id,
        userId: scope.userId,
      },
      { idempotencyKey: `journal_entry_index:${entry.id}` },
    );
  }

  return Response.json({ entry, queuedJobId });
}
