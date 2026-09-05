import type { CatalogKind, PlantObjectKind } from "@/db/schema";
import type { CatalogPickerKind } from "@/lib/garden/entry-contracts";

/** The legacy catalog kind a picker row maps to on the save path. */
export function catalogKindForPickerKind(kind: CatalogPickerKind): CatalogKind {
  if (kind === "cultivar") return "plant_variety";
  if (kind === "breed") return "breed";
  return "species";
}

export function pickerKindForCatalogKind(
  catalogKind: CatalogKind | string | null | undefined,
): CatalogPickerKind {
  if (catalogKind === "plant_variety") return "cultivar";
  if (catalogKind === "breed") return "breed";
  return "species";
}

export function defaultObjectKindForCatalogSelection(
  catalogKind: CatalogKind | string | null | undefined,
  source: string | null | undefined,
): PlantObjectKind {
  void source;
  return catalogKind === "breed" ? "animal" : "plant";
}

export function objectKindAfterCatalogSelection(
  currentObjectKind: PlantObjectKind,
  catalogKind: CatalogKind | string | null | undefined,
  source: string | null | undefined,
): PlantObjectKind {
  if (catalogKind === "species") {
    return normalizePlantObjectKind(currentObjectKind);
  }

  return defaultObjectKindForCatalogSelection(catalogKind, source);
}

/** The object kind a picker row implies: a breed is an animal, a cultivar a plant, a species keeps the current kind. */
export function objectKindAfterPickerSelection(
  currentObjectKind: PlantObjectKind,
  kind: CatalogPickerKind,
): PlantObjectKind {
  return objectKindAfterCatalogSelection(
    currentObjectKind,
    catalogKindForPickerKind(kind),
    null,
  );
}

export function resolveObjectKindForCatalogSelection(
  requestedObjectKind: PlantObjectKind | string | null | undefined,
  catalogKind: CatalogKind | string | null | undefined,
  source: string | null | undefined,
): PlantObjectKind {
  const normalized = requestedObjectKind?.trim() ?? "";
  const objectKind = normalizePlantObjectKind(normalized);

  if (catalogKind === "plant_variety") {
    if (objectKind !== "plant") {
      throw new Error(
        "Plant-variety catalog identities require a plant object.",
      );
    }
    return objectKind;
  }

  if (catalogKind !== "breed") {
    return objectKind;
  }

  if (!normalized) {
    return defaultObjectKindForCatalogSelection(catalogKind, source);
  }
  if (objectKind !== "animal") {
    throw new Error("Breed catalog identities require an animal object.");
  }
  return objectKind;
}

export function normalizePlantObjectKind(
  value: PlantObjectKind | string | null | undefined,
): PlantObjectKind {
  const normalized = value?.trim() ?? "";
  if (!normalized) return "plant";
  if (normalized === "plant" || normalized === "animal") {
    return normalized;
  }

  throw new Error("Object kind must be plant or animal.");
}

const LEGACY_BEE_COLONY_OBJECT_KIND = (["bee", "colony"] as const).join("_");

export function normalizePublicObjectKindFilter(
  value: string | null | undefined,
): PlantObjectKind | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized === "plant" || normalized === "animal") {
    return normalized;
  }
  if (normalized === LEGACY_BEE_COLONY_OBJECT_KIND) {
    return "animal";
  }
  return null;
}
