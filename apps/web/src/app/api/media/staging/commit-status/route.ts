import {
  readEphemeralMediaCommitStatus,
  verifyCommitStatusRequest,
} from "@/server/media/ephemeral-staging-commit-status";

export async function POST(request: Request) {
  let verified: Awaited<ReturnType<typeof verifyCommitStatusRequest>>;
  try {
    verified = await verifyCommitStatusRequest(request);
  } catch (error) {
    const code = errorCode(error);
    const status = code === "unavailable" ? 503 : 401;
    return closedJson(
      {
        code:
          status === 503
            ? "commit_status_unavailable"
            : "commit_status_unauthorized",
      },
      status,
    );
  }
  try {
    const status = await readEphemeralMediaCommitStatus(verified);
    return closedJson({ status }, 200);
  } catch {
    return closedJson({ status: "indeterminate" }, 200);
  }
}

function closedJson(body: Record<string, unknown>, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function errorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code: unknown }).code)
    : "unavailable";
}
