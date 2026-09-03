import { EPHEMERAL_MEDIA_VARIANT_LONG_EDGES } from "./ephemeral-staging-contract";
import { scaledVariantSize } from "./client-webp-policy";

/**
 * A variant lives next to its primary: `derivatives/<id>/<gen>.webp` becomes
 * `derivatives/<id>/<gen>-<longEdge>.webp` (ADR-0022, D2). Public URLs follow
 * the same rule, so this works on either a key or a URL.
 */
export function variantDerivativeKey(primaryKey: string, longEdge: number) {
  if (!primaryKey.endsWith(".webp")) {
    throw new Error("derivative_key_invalid");
  }
  return `${primaryKey.slice(0, -".webp".length)}-${longEdge}.webp`;
}

/** The primary key first, then one key per recorded variant. */
export function expandDerivativeObjectKeys(
  primaryKey: string,
  variantLongEdges: readonly number[] | null | undefined,
): string[] {
  return [
    primaryKey,
    ...normalizeVariantLongEdges(variantLongEdges).map((edge) =>
      variantDerivativeKey(primaryKey, edge),
    ),
  ];
}

/** Keeps only the long edges the contract knows, largest first, deduplicated. */
export function normalizeVariantLongEdges(
  value: readonly number[] | null | undefined,
): number[] {
  if (!Array.isArray(value)) return [];
  return (EPHEMERAL_MEDIA_VARIANT_LONG_EDGES as readonly number[]).filter(
    (edge) => value.includes(edge),
  );
}

export interface PublicMediaSourceSet {
  src: string;
  /** `null` when no variant exists or the intrinsic size is unknown. */
  srcSet: string | null;
}

/**
 * `<img srcset>` candidates for a public photo: each variant at the width it
 * was actually encoded at (the same rounding the encoder used), and the
 * primary last. The `sizes` attribute stays with the call site, which knows
 * the layout.
 */
export function buildPublicMediaSourceSet(input: {
  publicUrl: string;
  intrinsicWidth: number | null | undefined;
  intrinsicHeight: number | null | undefined;
  variantLongEdges: readonly number[] | null | undefined;
}): PublicMediaSourceSet {
  const edges = normalizeVariantLongEdges(input.variantLongEdges);
  const width = input.intrinsicWidth ?? 0;
  const height = input.intrinsicHeight ?? 0;
  if (edges.length === 0 || width < 1 || height < 1) {
    return { src: input.publicUrl, srcSet: null };
  }
  const candidates = edges
    .filter((edge) => edge < Math.max(width, height))
    .map((edge) => {
      const size = scaledVariantSize(width, height, edge);
      return `${variantDerivativeKey(input.publicUrl, edge)} ${size.width}w`;
    })
    .reverse();
  if (candidates.length === 0) return { src: input.publicUrl, srcSet: null };
  return {
    src: input.publicUrl,
    srcSet: [...candidates, `${input.publicUrl} ${width}w`].join(", "),
  };
}
