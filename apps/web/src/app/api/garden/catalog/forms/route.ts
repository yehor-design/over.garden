import { isObjectSetupUuid } from "@/lib/garden/object-setup";
import {
  mutationScopeResponse,
  ownerUserIdFromRequest,
  resolveMutationScope,
} from "@/server/mutation-scope";
import { listSpeciesForms } from "@/server/species-forms-repository";
import { settleSection } from "@/server/workspace-failure";

const headers = { "Cache-Control": "private, no-store, max-age=0" };

/**
 * A species' list of cultivars or breeds for the object stepper's
 * «Сорт» / «Порода» step (OVE-524): the ones some object in the project uses
 * and the ones gardeners added, most used first. Never cached: an entry one
 * gardener adds is offered to the next at once.
 */
export async function GET(request: Request) {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromRequest(request),
  });
  if (admission.status === "rejected") {
    const response = mutationScopeResponse(admission);
    response.headers.set("Cache-Control", headers["Cache-Control"]);
    return response;
  }
  const params = new URL(request.url).searchParams;
  const speciesId = params.get("species");
  const kind = params.get("kind");
  if (
    !isObjectSetupUuid(speciesId) ||
    (kind !== "plant" && kind !== "animal")
  ) {
    return Response.json({ error: "invalid_query" }, { status: 400, headers });
  }
  const result = await settleSection(
    () =>
      listSpeciesForms({
        speciesId: speciesId.toLowerCase(),
        objectKind: kind,
      }),
    { deadlineMs: 4500, surface: "object-setup", section: "species-forms" },
  );
  return result.status === "ready"
    ? Response.json({ forms: result.value }, { headers })
    : Response.json(
        { error: "unavailable", digest: result.digest },
        { status: 503, headers },
      );
}
