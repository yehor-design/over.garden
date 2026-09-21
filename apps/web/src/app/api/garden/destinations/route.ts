import {
  InvalidDestinationQuery,
  listOwnedDestinations,
  parseDestinationQuery,
} from "@/server/owned-destination-repository";
import {
  mutationScopeResponse,
  ownerUserIdFromRequest,
  resolveMutationScope,
} from "@/server/mutation-scope";
import { settleSection } from "@/server/workspace-failure";
const headers = { "Cache-Control": "private, no-store, max-age=0" };
export async function GET(request: Request) {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromRequest(request),
  });
  if (admission.status === "rejected") return mutationScopeResponse(admission);
  let query;
  try {
    query = parseDestinationQuery(new URL(request.url).searchParams);
  } catch (error) {
    if (error instanceof InvalidDestinationQuery)
      return Response.json(
        { error: "invalid_query" },
        { status: 400, headers },
      );
    throw error;
  }
  const result = await settleSection(
    () => listOwnedDestinations(admission.scope, query),
    { deadlineMs: 4500, surface: "owned-destinations", section: "search" },
  );
  return result.status === "ready"
    ? Response.json(result.value, { headers })
    : Response.json(
        { error: "unavailable", digest: result.digest },
        { status: 503, headers },
      );
}
