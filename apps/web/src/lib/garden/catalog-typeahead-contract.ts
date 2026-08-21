import type { FirstEntryCatalogSelection } from "@/lib/garden/entry-contracts";
import { catalogSuggestionTrustMetadata } from "@/lib/garden/catalog-trust";
import { isOve330ServeClass } from "@/lib/media/presentation-contract";

export function parseCatalogTypeaheadResponse(
  value: unknown,
): FirstEntryCatalogSelection[] {
  if (!value || typeof value !== "object") return [];

  const suggestions = (value as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(suggestions)) return [];

  return suggestions.flatMap((suggestion) => {
    if (!suggestion || typeof suggestion !== "object") return [];

    const candidate = suggestion as Partial<FirstEntryCatalogSelection>;
    if (
      !isUuid(candidate.id) ||
      typeof candidate.displayName !== "string" ||
      typeof candidate.canonicalName !== "string" ||
      !isSelectableCatalogKind(candidate.catalogKind) ||
      typeof candidate.locale !== "string" ||
      !isSelectableCatalogStatus(candidate.status) ||
      typeof candidate.source !== "string"
    ) {
      return [];
    }

    const safeSelection = {
      id: candidate.id,
      displayName: candidate.displayName,
      canonicalName: candidate.canonicalName,
      catalogKind: candidate.catalogKind,
      locale: candidate.locale,
      status: candidate.status,
      source: candidate.source,
      serveClass: isOve330ServeClass(candidate.serveClass)
        ? candidate.serveClass
        : "exact",
    } satisfies FirstEntryCatalogSelection;

    return [
      {
        ...safeSelection,
        ...catalogSuggestionTrustMetadata(safeSelection),
      },
    ];
  });
}

export function catalogItemIdForSelection(
  selection: FirstEntryCatalogSelection | null,
) {
  return selection?.id ?? null;
}

function isSelectableCatalogKind(
  value: unknown,
): value is FirstEntryCatalogSelection["catalogKind"] {
  return value === "plant_variety" || value === "species" || value === "breed";
}

function isSelectableCatalogStatus(
  value: unknown,
): value is FirstEntryCatalogSelection["status"] {
  return value === "seeded" || value === "confirmed";
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
