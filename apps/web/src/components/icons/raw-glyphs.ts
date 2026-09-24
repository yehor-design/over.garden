/**
 * Phosphor glyphs as SVG markup, for the one document the product draws
 * without React: the raw `404`/`410` lifecycle page the proxy answers with
 * (`lib/public-lifecycle-document.ts`). It has no bundle and no component
 * tree, so it cannot render `@/components/icons/*`, and it drew its language
 * menu with `▾` and `✓` text glyphs instead — a second icon family on the
 * pages a reader meets when something is gone (DESIGN.md §2.8).
 *
 * The paths are Phosphor's regular weight on its 256-unit grid, copied from
 * the installed `@phosphor-icons/react`; `raw-glyphs.test.ts` reads that
 * package and fails if a glyph here stops matching it.
 */
export const RAW_GLYPH_PATHS = {
  CaretDown:
    "M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z",
  Check:
    "M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z",
  Translate:
    "M247.15,212.42l-56-112a8,8,0,0,0-14.31,0l-21.71,43.43A88,88,0,0,1,108,126.93,103.65,103.65,0,0,0,135.69,64H160a8,8,0,0,0,0-16H104V32a8,8,0,0,0-16,0V48H32a8,8,0,0,0,0,16h87.63A87.76,87.76,0,0,1,96,116.35a87.74,87.74,0,0,1-19-31,8,8,0,1,0-15.08,5.34A103.63,103.63,0,0,0,84,127a87.55,87.55,0,0,1-52,17,8,8,0,0,0,0,16,103.46,103.46,0,0,0,64-22.08,104.18,104.18,0,0,0,51.44,21.31l-26.6,53.19a8,8,0,0,0,14.31,7.16L148.94,192h70.11l13.79,27.58A8,8,0,0,0,240,224a8,8,0,0,0,7.15-11.58ZM156.94,176,184,121.89,211.05,176Z",
} as const;

export type RawGlyphName = keyof typeof RAW_GLYPH_PATHS;

/**
 * One glyph as an inline `<svg>`: decorative (`aria-hidden`, not focusable),
 * `currentColor`, 16 px — `--size-icon-sm`, the size beside body-sm text.
 * `dataAttribute` names the glyph for a test to find; it is never content.
 */
export function rawGlyphSvg(name: RawGlyphName, dataAttribute: string) {
  return `<svg ${dataAttribute}="${name}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false"><path d="${RAW_GLYPH_PATHS[name]}"/></svg>`;
}
