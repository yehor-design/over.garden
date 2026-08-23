import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier/flat";

// ── Design-system guardrails (AGENTS.md lint gate) ───────────────────────────
// These are ERRORS, so they FAIL `pnpm lint` (and `next build` via the prebuild
// hook). They enforce that app code uses design tokens, never magic values:
//   1. no inline `style={{...}}` props
//   2. no arbitrary Tailwind values (e.g. `w-[437px]`) — but arbitrary VARIANT
//      selectors (`[&_svg]:...`, `data-[state=open]:...`) stay allowed via the
//      `(?!:)` lookahead (a `[...]` followed by `:` is a variant, not a value)
//   3. no raw hex color literals (`#rgb`/`#rrggbb`)
// ESLint honours only ONE `no-restricted-syntax` per config object, so every
// selector lives in this single array.
//
// These are BEST-EFFORT lexical guards: they catch the direct mistake (the
// common case), but cannot catch a value moved behind a variable or built by
// concatenation (`const w = "w-[437px]"`). The real "tokens only" guarantee is
// the design-system discipline; treat these as a fast guardrail, not a proof.
const designGuardrails = {
  "no-restricted-syntax": [
    "error",
    {
      selector: "JSXAttribute[name.name='style']",
      message:
        "Inline `style` props are banned — use Tailwind utility classes / design tokens.",
    },
    {
      selector:
        "JSXAttribute[name.name='className'] Literal[value=/\\[[^\\]]*\\](?!:)/]",
      message:
        "Arbitrary Tailwind values (e.g. w-[437px]) are banned — use a design token.",
    },
    {
      selector:
        "JSXAttribute[name.name='className'] TemplateElement[value.raw=/\\[[^\\]]*\\](?!:)/]",
      message:
        "Arbitrary Tailwind values are banned in template strings too — use a design token.",
    },
    {
      // Negative lookbehind avoids URL fragments (`/docs#abcdef`) and other
      // word-preceded `#...` tokens; matches a standalone #rgb / #rrggbb.
      selector: "Literal[value=/(?<![\\w/#])#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\\b/]",
      message:
        "Raw hex color literals are banned — reference a design token / CSS variable.",
    },
    {
      selector:
        "TemplateElement[value.raw=/(?<![\\w/#])#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\\b/]",
      message: "Raw hex color literals are banned in template strings.",
    },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: designGuardrails,
  },
  {
    // shadcn/ui primitives are the vendored framework base layer. They
    // legitimately use arbitrary values (`rounded-[min(...)]`, `text-[0.8rem]`)
    // and arbitrary variant selectors. The token discipline applies to app
    // code, not these primitives — exempt them.
    files: ["src/components/ui/**"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    // OVE-197 subject-aware media needs continuous focal object-position and
    // marker coordinates; those cannot be expressed as static design tokens.
    files: ["src/components/media/**"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    // The Web App Manifest spec requires literal hex colors.
    files: ["src/app/manifest.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  // Disable ESLint formatting rules that would conflict with Prettier.
  eslintConfigPrettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/sw.js",
    "cloudflare/media-staging/worker-configuration.d.ts",
  ]),
]);

export default eslintConfig;
