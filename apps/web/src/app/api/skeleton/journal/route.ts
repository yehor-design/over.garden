import {
  isWalkingSkeletonRequestHostAllowed,
  tryResolveWalkingSkeletonEnvironment,
} from "@/lib/walking-skeleton/environment";
import {
  AuthenticationRequiredError,
  requireCurrentUserId,
} from "@/server/auth-session";
import {
  createJournalEntry,
  listMyRecentJournalEntries,
} from "@/server/journal-repository";
import { enqueueJournalEntryIndexJob } from "@/server/search/public-journal-parity";
import {
  PilotWriteAccessError,
  requireWriteEligibleRequestScope,
} from "@/server/pilot-write-access";
import { scopedToUser } from "@/server/request-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "X-Robots-Tag": "noindex, nofollow",
} as const;
const MAX_REQUEST_BYTES = 16 * 1024;

export async function GET(request: Request) {
  if (!isWalkingSkeletonRequestAllowed(request)) {
    return notFoundResponse();
  }

  try {
    const userId = await requireCurrentUserId();
    const entries = await listMyRecentJournalEntries(scopedToUser(userId), 10);
    return Response.json({ entries }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  if (!isWalkingSkeletonRequestAllowed(request)) {
    return notFoundResponse();
  }

  let scope: Awaited<ReturnType<typeof requireWriteEligibleRequestScope>>;
  try {
    scope = await requireWriteEligibleRequestScope();
  } catch (error) {
    return errorResponse(error);
  }

  const input = await parseInput(request);
  if (!input) return invalidPayloadResponse();

  try {
    const entry = await createJournalEntry(scope, input);

    let queuedJobId: string | null = null;
    if (entry.visibility === "public") {
      queuedJobId = await enqueueJournalEntryIndexJob({
        journalEntryId: entry.id,
        userId: scope.userId,
      });
    }

    return Response.json(
      { entry, queuedJobId },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

interface SkeletonJournalInput {
  body: string;
  visibility: "private" | "public";
  clientMutationId: string;
}

async function parseInput(request: Request): Promise<SkeletonJournalInput | null> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json") return null;

  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (
      !Number.isSafeInteger(contentLength) ||
      contentLength < 0 ||
      contentLength > MAX_REQUEST_BYTES
    ) {
      return null;
    }
  }

  const serialized = await readBoundedBody(request);
  if (serialized === null) {
    return null;
  }

  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return null;
  }
  if (!isPlainObject(value)) return null;

  const allowedKeys = new Set(["body", "visibility", "clientMutationId"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return null;

  if (typeof value.body !== "string") return null;
  const body = value.body.trim();
  if (body.length === 0 || body.length > 2_000) return null;

  if (
    value.visibility !== undefined &&
    value.visibility !== "private" &&
    value.visibility !== "public"
  ) {
    return null;
  }

  let clientMutationId = crypto.randomUUID();
  if (value.clientMutationId !== undefined) {
    if (typeof value.clientMutationId !== "string") return null;
    clientMutationId = value.clientMutationId.trim();
    if (clientMutationId.length === 0 || clientMutationId.length > 200) {
      return null;
    }
  }

  return {
    body,
    visibility: value.visibility === "public" ? "public" : "private",
    clientMutationId,
  };
}

async function readBoundedBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;

  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytesRead = 0;
  let serialized = "";

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;

      bytesRead += chunk.value.byteLength;
      if (bytesRead > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return null;
      }
      serialized += decoder.decode(chunk.value, { stream: true });
    }

    serialized += decoder.decode();
    return serialized;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function notFoundResponse() {
  return new Response(null, { status: 404, headers: NO_STORE_HEADERS });
}

function isWalkingSkeletonRequestAllowed(request: Request) {
  return (
    tryResolveWalkingSkeletonEnvironment(process.env) !== null &&
    isWalkingSkeletonRequestHostAllowed(request.url) &&
    isWalkingSkeletonRequestHostAllowed(request.headers.get("host"))
  );
}

function invalidPayloadResponse() {
  return Response.json(
    { error: "A valid journal entry payload is required." },
    { status: 400, headers: NO_STORE_HEADERS },
  );
}

function errorResponse(error: unknown) {
  if (error instanceof AuthenticationRequiredError) {
    return Response.json(
      { error: "Sign in to continue." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  if (error instanceof PilotWriteAccessError) {
    return Response.json(
      { error: "This account cannot use this local diagnostic." },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }

  return Response.json(
    { error: "The request could not be completed." },
    { status: 500, headers: NO_STORE_HEADERS },
  );
}
