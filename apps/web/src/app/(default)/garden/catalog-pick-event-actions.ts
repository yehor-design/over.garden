"use server";

import { requireCurrentRequestScope } from "@/server/auth-session";
import {
  isCatalogPickOutcome,
  recordCatalogPickEvent,
} from "@/server/catalog-health-repository";

/**
 * How one attempt to name a plant ended (OVE-398, ADR-0026 D12).
 *
 * The picker calls this after the fact and ignores the answer, so a failure
 * here never reaches a gardener: a measurement is not worth failing someone's
 * action over. Nothing is forwarded to any third party, and what is stored is
 * a length rather than the query — a gardener's own words about their own
 * garden do not belong in a metrics table.
 */
export async function recordCatalogPickEventAction(input: {
  outcome: string;
  queryLength: number;
  msToPick: number | null;
  locale: string;
  objectKind: string;
  catalogItemId: string | null;
}): Promise<{ recorded: boolean }> {
  try {
    if (!isCatalogPickOutcome(input.outcome)) return { recorded: false };
    const scope = await requireCurrentRequestScope();
    const id = await recordCatalogPickEvent({
      ownerUserId: scope.userId,
      outcome: input.outcome,
      queryLength: Number(input.queryLength),
      msToPick:
        input.msToPick === null || input.msToPick === undefined
          ? null
          : Number(input.msToPick),
      locale: String(input.locale ?? "uk"),
      objectKind: String(input.objectKind ?? "plant"),
      catalogItemId:
        typeof input.catalogItemId === "string" ? input.catalogItemId : null,
    });
    return { recorded: id !== null };
  } catch {
    return { recorded: false };
  }
}
