/**
 * The light theme's semantic colours and the popover's shadow, each as the
 * value `globals.css` resolves the token to, for the one document that cannot
 * read that stylesheet: the raw `404`/`410` lifecycle document the proxy
 * answers with, which has no React and no stylesheet at all (`OVE-478`).
 *
 * Written out once, here, with the token named beside each;
 * `public-lifecycle-document.test.ts` resolves every token through
 * `globals.css` and fails if one drifts.
 */
export const RAW_DOCUMENT_PALETTE = {
  surface: { token: "--color-surface", value: "oklch(1 0 0)" },
  "surface-hover": {
    token: "--color-surface-hover",
    value: "oklch(0.955 0.004 150)",
  },
  line: { token: "--color-border", value: "oklch(0.917 0.005 150)" },
  "line-control": {
    token: "--color-border-control",
    value: "oklch(0.585 0.008 150)",
  },
  muted: { token: "--color-text-muted", value: "oklch(0.487 0.008 150)" },
  "action-hover": {
    token: "--color-action-hover",
    value: "oklch(0.395 0.008 150)",
  },
  heading: { token: "--color-text-heading", value: "oklch(0.285 0.007 150)" },
  text: { token: "--color-text", value: "oklch(0.205 0.006 150)" },
  action: { token: "--color-action", value: "oklch(0.205 0.006 150)" },
  "on-fill": { token: "--color-text-on-fill", value: "oklch(1 0 0)" },
  "shadow-popover": {
    token: "--shadow-popover",
    value: "0 1px 2px oklch(0 0 0 / 0.04), 0 4px 12px oklch(0 0 0 / 0.08)",
  },
} as const;

/** The palette as custom properties, `--surface: …;` and so on, for a `:root` rule. */
export const RAW_DOCUMENT_PALETTE_DECLARATIONS = Object.entries(
  RAW_DOCUMENT_PALETTE,
)
  .map(([name, { value }]) => `--${name}: ${value};`)
  .join(" ");
