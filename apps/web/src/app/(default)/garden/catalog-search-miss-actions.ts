"use server";

import type { PlantObjectKind } from "@/db/schema";
import { isPublicLocale } from "@/lib/public-localization";
import { requireCurrentRequestScope } from "@/server/auth-session";
import { recordCatalogSearchMiss } from "@/server/catalog-repository";

/**
 * A query that ended without a pick, kept as curation input (ADR-0026 D7):
 * the normalized text, the locale and the object kind, nothing else. The
 * picker calls this after the fact and ignores the answer, so a failure here
 * never reaches a gardener; nothing is forwarded to any third party.
 */
export async function recordCatalogSearchMissAction(input: {
  query: string;
  locale: string;
  objectKind: string;
}): Promise<{ recorded: boolean }> {
  try {
    await requireCurrentRequestScope();
    const locale = isPublicLocale(input.locale) ? input.locale : "uk";
    const objectKind: PlantObjectKind =
      input.objectKind === "animal" ? "animal" : "plant";
    const query = typeof input.query === "string" ? input.query : "";
    const result = await recordCatalogSearchMiss({ query, locale, objectKind });
    return { recorded: result !== null };
  } catch {
    return { recorded: false };
  }
}
