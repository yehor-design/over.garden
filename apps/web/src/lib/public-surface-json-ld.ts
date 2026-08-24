export function serializePublicSurfaceJsonLd(
  jsonLd: Record<string, unknown> | null,
) {
  if (!jsonLd) return null;
  return JSON.stringify(jsonLd).replace(/</gu, "\\u003c");
}
