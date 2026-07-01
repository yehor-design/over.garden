import type { CatalogKind, PlantObjectKind } from "@/db/schema";

export function defaultObjectKindForCatalogSelection(
  catalogKind: CatalogKind | string | null | undefined,
  source: string | null | undefined,
): PlantObjectKind {
  if (catalogKind !== "breed") return "plant";
  return source === "ua_official_bee_breed" ? "bee_colony" : "animal";
}

export function resolveObjectKindForCatalogSelection(
  requestedObjectKind: PlantObjectKind | string | null | undefined,
  catalogKind: CatalogKind | string | null | undefined,
  source: string | null | undefined,
): PlantObjectKind {
  const normalized = requestedObjectKind?.trim() ?? "";

  if (catalogKind !== "breed") {
    return normalizePlantObjectKind(normalized);
  }

  if (!normalized || normalized === "plant") {
    return defaultObjectKindForCatalogSelection(catalogKind, source);
  }
  if (normalized === "bee_colony" || normalized === "animal") {
    return normalized;
  }

  throw new Error("Object kind must be plant, bee colony, or animal.");
}

export function normalizePlantObjectKind(
  value: PlantObjectKind | string | null | undefined,
): PlantObjectKind {
  const normalized = value?.trim() ?? "";
  if (!normalized) return "plant";
  if (
    normalized === "plant" ||
    normalized === "bee_colony" ||
    normalized === "animal"
  ) {
    return normalized;
  }

  throw new Error("Object kind must be plant, bee colony, or animal.");
}
