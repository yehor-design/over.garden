import type {
  ActivationSource,
  ActivationSurfaceKind,
} from "@/lib/garden/entry-contracts";

export const DIRECT_GARDEN_ACTIVATION_SOURCE: ActivationSource =
  "direct_garden";

export function normalizeActivationSourceParam(
  value: string | string[] | undefined,
  options: { hasResolvedCatalogSelection?: boolean } = {},
): ActivationSource {
  const normalized = normalizeFirstParam(value);

  if (normalized === "homepage") return "homepage";
  if (normalized === "direct-garden" || normalized === "direct_garden") {
    return DIRECT_GARDEN_ACTIVATION_SOURCE;
  }
  if (normalized === "public-variety" || normalized === "public_variety") {
    return options.hasResolvedCatalogSelection
      ? "public_variety"
      : DIRECT_GARDEN_ACTIVATION_SOURCE;
  }

  return DIRECT_GARDEN_ACTIVATION_SOURCE;
}

export function normalizeActivationSourceValue(
  value: unknown,
): ActivationSource | null {
  if (
    value === "homepage" ||
    value === "public_variety" ||
    value === "direct_garden"
  ) {
    return value;
  }

  return null;
}

export function activationSurfaceKindForSource(
  source: ActivationSource,
): ActivationSurfaceKind {
  switch (source) {
    case "homepage":
      return "homepage";
    case "public_variety":
      return "variety";
    case "direct_garden":
      return "garden";
  }
}

function normalizeFirstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return typeof value === "string" ? value.trim() : "";
}
