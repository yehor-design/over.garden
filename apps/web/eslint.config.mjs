import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier/flat";

/* ── The design-system gates (DESIGN.md §10, OVE-442) ────────────────────────
 *
 * Four of the nine gates live here, because ESLint already reads every file on
 * every `pnpm lint` and `next build`. Each one is an **error**, each names the
 * file and the line, and each says what to write instead — a step that ends at
 * `exit code 1` with no output cost this repository days once, and that is why
 * every message below is a sentence rather than a code.
 *
 * ESLint honours only ONE `no-restricted-syntax` per config object, so the
 * selectors are composed into arrays here and a later config object replaces
 * the whole array for the files it matches.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Tailwind's own palettes. Ours is `--og-*`, and it never leaves globals.css. */
const TAILWIND_PALETTES = [
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
].join("|");

const COLOUR_UTILITIES = [
  "bg",
  "text",
  "border",
  "ring",
  "fill",
  "stroke",
  "outline",
  "from",
  "to",
  "via",
  "decoration",
  "shadow",
  "divide",
  "accent",
  "caret",
  "placeholder",
].join("|");

/**
 * Gate 1 — a palette utility anywhere in a className.
 *
 * `white` and `black` carry no step, and they are the two that slip through a
 * pattern written only for `<palette>-<step>`: `text-white` survived the whole
 * of `OVE-439` that way. `transparent`, `current` and `inherit` are keywords
 * rather than colours and stay allowed.
 */
const PALETTE_PATTERN = `\\b(?:${COLOUR_UTILITIES})-(?:(?:${TAILWIND_PALETTES})-(?:50|[1-9]00|950)|white|black)\\b`;
const PALETTE_MESSAGE =
  "Tailwind's palette is not this product's palette. Use a semantic token from DESIGN.md §2.2 (bg-surface, text-text-muted, border-border-control, …).";

// Gate 1 — a colour literal anywhere in source.
const HEX_PATTERN = "(?<![\\w/#])#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\\b";
const HEX_MESSAGE =
  "A hex colour is a token that escaped. Every colour is defined once, in src/app/globals.css.";
const OKLCH_MESSAGE =
  "An oklch() literal belongs to the primitive layer, which lives only in src/app/globals.css.";

/**
 * Gate 2 — an arbitrary value, but not an arbitrary *variant*.
 *
 * `data-[state=open]:`, `has-[:checked]:` and `[&_svg]:` are selectors and stay
 * allowed: the `(?!:)` lookahead is what tells them apart from a value, and
 * without it this rule would flag some ninety selectors that are all correct. A
 * rule that fails on a clean tree is not shippable.
 *
 * `transition-[width]` names a property rather than a magic number, and a
 * `calc()`/`min()` over a `var(--…)` is computed geometry, which §10 allows.
 */
const ARBITRARY_PATTERN =
  "\\[(?!&)(?!:)(?!(?:calc|min|max|clamp)\\([^\\]]*var\\(--)(?![a-z-]+(?:,[a-z-]+)*\\])[^\\]]*\\](?!:)";
const ARBITRARY_MESSAGE =
  "An arbitrary Tailwind value is a number nobody can find again. Use a token (DESIGN.md §2.3–§2.5), or compute from one with calc(var(--…)).";

// Gate 5 — a z-index literal.
const Z_INDEX_PATTERN = "\\bz-(?:[0-9]+|auto)\\b";
const Z_INDEX_MESSAGE =
  "Layering is a closed scale: z-base, z-sticky, z-rail, z-header, z-popover, z-overlay, z-toast (DESIGN.md §2.11).";

const STYLE_MESSAGE =
  "An inline style prop is a token that escaped. The exception is computed geometry inside components/ui, which this rule allows there and nowhere else.";

/**
 * Where className text actually lives: in the attribute, and in the module-level
 * constants that feed it. A gate that reads only the attribute misses every
 * `cva()` recipe, which is where a variant's colours are written.
 *
 * The families are kept disjoint on purpose, and narrow on purpose. A selector
 * that matches the same literal twice prints the same error twice, and a gate
 * whose output is padded is a gate people learn to skim. A selector that reads
 * every module-level string flags a regex character class and a SQL array — a
 * draft of this file did, on `[a-z0-9]+` and `array['kind', …]::text[]`, and a
 * rule that fails on a clean tree is not shippable.
 */
function classNameSelectors(pattern, message) {
  return [
    {
      selector: `JSXAttribute[name.name='className'] Literal[value=/${pattern}/]`,
      message,
    },
    {
      selector: `JSXAttribute[name.name='className'] TemplateElement[value.raw=/${pattern}/]`,
      message,
    },
    {
      selector: `VariableDeclarator > CallExpression[callee.name=/^(?:cva|cn)$/] Literal[value=/${pattern}/]`,
      message,
    },
    {
      selector: `VariableDeclarator[id.name=/(?:variants|class|class_?name|classes)$/i] > Literal[value=/${pattern}/]`,
      message,
    },
  ];
}

const colourGates = [
  ...classNameSelectors(PALETTE_PATTERN, PALETTE_MESSAGE),
  { selector: `Literal[value=/${HEX_PATTERN}/]`, message: HEX_MESSAGE },
  {
    selector: `TemplateElement[value.raw=/${HEX_PATTERN}/]`,
    message: HEX_MESSAGE,
  },
  { selector: "Literal[value=/oklch\\(/]", message: OKLCH_MESSAGE },
  {
    selector: "TemplateElement[value.raw=/oklch\\(/]",
    message: OKLCH_MESSAGE,
  },
];

const arbitraryValueGate = classNameSelectors(
  ARBITRARY_PATTERN,
  ARBITRARY_MESSAGE,
);
const zIndexGate = classNameSelectors(Z_INDEX_PATTERN, Z_INDEX_MESSAGE);
const layoutGates = [...arbitraryValueGate, ...zIndexGate];

const styleGate = [
  { selector: "JSXAttribute[name.name='style']", message: STYLE_MESSAGE },
];

// Gate 4 — a raw form control outside components/ui.
const RAW_CONTROL_MESSAGE =
  "A control belongs to components/ui: Input, Textarea, Select, Checkbox, Radio, Switch, SearchInput, FileDrop, or HiddenField for a form payload (DESIGN.md §4.1).";
const rawControlGate = ["input", "select", "textarea"].map((element) => ({
  selector: `JSXOpeningElement[name.name='${element}']`,
  message: RAW_CONTROL_MESSAGE,
}));

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...colourGates,
        ...layoutGates,
        ...styleGate,
        ...rawControlGate,
      ],
    },
  },
  {
    // `components/ui` owns the controls and the computed geometry — a progress
    // bar's width *is* its value, and no token can hold it. Everything else
    // still applies here: a palette utility, a hex, an `oklch()` literal or a
    // z-index number is a defect in a primitive exactly as it is on a page.
    files: ["src/components/ui/**"],
    rules: {
      "no-restricted-syntax": ["error", ...colourGates, ...layoutGates],
    },
  },
  {
    // A test quotes the markup it asserts on, including the markup a gate
    // exists to reject: `globals.test.ts` names the purple that was removed,
    // and a render assertion spells the class list it expects. A string in a
    // test ships to nobody, and what tests owe the system is gate 6 —
    // `scripts/check-component-tests.ts` — not this.
    files: ["src/**/*.test.{ts,tsx}", "src/**/*.spec.{ts,tsx}"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    // Google's identity guidelines require their mark, in their four colours,
    // on any button that starts a Google sign-in (`OVE-455`). Those four are a
    // third party's trademark, not this product's palette: they must never be
    // re-pointed and therefore must never become tokens, which is exactly what
    // the colour gate exists to insist on for everything else. One file, by
    // path; every other gate stands.
    files: ["src/components/auth/google-sign-in-button.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...layoutGates,
        ...styleGate,
        ...rawControlGate,
      ],
    },
  },
  {
    // The raw `404`/`410` lifecycle document the proxy answers with is the
    // one page with no stylesheet and no React: it cannot read a token, so it
    // carries the light theme's resolved values itself (`OVE-478`). They are
    // written once, beside the semantic token each copies, and
    // `public-lifecycle-document.test.ts` resolves each through `globals.css`
    // and fails if one drifts. One file, by path; every other gate stands.
    files: ["src/lib/raw-document-palette.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...layoutGates,
        ...styleGate,
        ...rawControlGate,
      ],
    },
  },
  {
    // OVE-197 subject-aware media needs continuous focal object-position and
    // marker coordinates; those cannot be expressed as static design tokens,
    // so the arbitrary-value gate and the inline-style gate stand down here.
    // Layering is not geometry and stays closed: a focal point is a number
    // nobody can predict, and a z-index is one somebody chose.
    files: ["src/components/media/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...colourGates,
        ...zIndexGate,
        ...rawControlGate,
      ],
    },
  },
  // Disable ESLint formatting rules that would conflict with Prettier.
  eslintConfigPrettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "test-results/**",
    "playwright-report/**",
    "build/**",
    "next-env.d.ts",
    "public/sw.js",
    "cloudflare/media-staging/worker-configuration.d.ts",
  ]),
]);

export default eslintConfig;
