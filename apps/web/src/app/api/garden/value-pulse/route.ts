import {
  recordFollowUpValuePulseResponse,
} from "@/server/follow-up-value-pulse";
import { requireCurrentRequestScope } from "@/server/auth-session";

export const runtime = "nodejs";

interface ValuePulseRequestBody {
  plantObjectId?: string;
  journalEntryId?: string;
  outcome?: string;
  usefulness?: string;
  usefulnessReason?: string | null;
}

export async function POST(request: Request) {
  let scope;
  try {
    scope = await requireCurrentRequestScope();
  } catch {
    return Response.json(
      { error: "Sign in to save feedback." },
      { status: 401 },
    );
  }

  const body = (await request
    .json()
    .catch(() => null)) as ValuePulseRequestBody | null;

  if (!body) {
    return Response.json(
      { error: "Feedback payload is required." },
      { status: 400 },
    );
  }

  const result = await recordFollowUpValuePulseResponse(scope, {
    plantObjectId: body.plantObjectId ?? "",
    journalEntryId: body.journalEntryId ?? "",
    outcome: body.outcome as "submitted" | "skipped",
    usefulness: body.usefulness as
      | "useful"
      | "not_sure"
      | "not_useful"
      | null
      | undefined,
    usefulnessReason: body.usefulnessReason as
      | "history_felt_worth_keeping"
      | "easy_to_add_update"
      | "prior_entries_helped"
      | "felt_redundant"
      | "hard_to_find_what_i_needed"
      | "not_sure_why"
      | null
      | undefined,
  });

  if (!result.recorded) {
    return Response.json(
      { error: result.error ?? "Feedback could not be saved." },
      { status: 400 },
    );
  }

  return Response.json({ ok: true });
}
