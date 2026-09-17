import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const GLOBALS_PATH = fileURLToPath(new URL("./globals.css", import.meta.url));
const SOURCE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const globals = readFileSync(GLOBALS_PATH, "utf8");

/* ── colour, computed rather than quoted ──────────────────────────────────────
   The trap this file exists to avoid: do **not** measure contrast with
   `getComputedStyle`. Browsers now serialise an `oklch()` author value as
   `lab()`, and a regex expecting three integers reads the Lab components as
   RGB and invents failures — a first audit of `/journals` reported 102
   violations that do not exist. Everything below converts the OKLCH literal
   in the stylesheet itself, so the number the assertion sees is the number the
   reader gets.
   ─────────────────────────────────────────────────────────────────────────── */

type LinearRgb = readonly [number, number, number];

/** OKLab → linear sRGB, Björn Ottosson's matrices. */
function oklchToLinearSrgb(
  l: number,
  c: number,
  hueDegrees: number,
): LinearRgb {
  const hue = (hueDegrees * Math.PI) / 180;
  const a = c * Math.cos(hue);
  const b = c * Math.sin(hue);
  const lRoot = l + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = l - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = l - 0.0894841775 * a - 1.291485548 * b;
  const lCone = lRoot ** 3;
  const mCone = mRoot ** 3;
  const sCone = sRoot ** 3;
  return [
    4.0767416621 * lCone - 3.3077115913 * mCone + 0.2309699292 * sCone,
    -1.2684380046 * lCone + 2.6097574011 * mCone - 0.3413193965 * sCone,
    -0.0041960863 * lCone - 0.7034186147 * mCone + 1.707614701 * sCone,
  ];
}

const clampUnit = (value: number) => Math.min(1, Math.max(0, value));

/** WCAG 2.x relative luminance. Linear sRGB is already gamma-decoded. */
function relativeLuminance([r, g, b]: LinearRgb): number {
  return 0.2126 * clampUnit(r) + 0.7152 * clampUnit(g) + 0.0722 * clampUnit(b);
}

function contrastRatio(a: LinearRgb, b: LinearRgb): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Every `--og-*: oklch(L C H)` declared in the stylesheet. */
function readPrimitives(css: string): Map<string, LinearRgb> {
  const primitives = new Map<string, LinearRgb>();
  const pattern =
    /(--og-[a-z0-9-]+):\s*oklch\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*\)/gu;
  for (const match of css.matchAll(pattern)) {
    primitives.set(
      match[1],
      oklchToLinearSrgb(Number(match[2]), Number(match[3]), Number(match[4])),
    );
  }
  return primitives;
}

/** Every `--color-*: var(--og-*)` mapping, i.e. the semantic layer. */
function readSemantics(css: string): Map<string, string> {
  const semantics = new Map<string, string>();
  const pattern = /(--color-[a-z0-9-]+):\s*var\((--og-[a-z0-9-]+)\)/gu;
  for (const match of css.matchAll(pattern)) {
    semantics.set(match[1], match[2]);
  }
  return semantics;
}

const primitives = readPrimitives(globals);
const semantics = readSemantics(globals);

function colourOf(semanticName: string): LinearRgb {
  const primitive = semantics.get(semanticName);
  expect(primitive, `${semanticName} is not mapped to a primitive`).toBeTypeOf(
    "string",
  );
  const colour = primitives.get(primitive as string);
  expect(colour, `${primitive} is not declared in globals.css`).toBeDefined();
  return colour as LinearRgb;
}

const ratioOf = (a: string, b: string) =>
  contrastRatio(colourOf(a), colourOf(b));

/** The closed set of DESIGN.md §2.2. Nothing else may be invented. */
const SEMANTIC_COLOUR_NAMES = [
  "--color-surface",
  "--color-surface-sunken",
  "--color-surface-raised",
  "--color-surface-hover",
  "--color-surface-inverse",
  "--color-text",
  "--color-text-heading",
  "--color-text-secondary",
  "--color-text-muted",
  "--color-text-disabled",
  "--color-text-on-fill",
  "--color-text-link",
  "--color-text-link-hover",
  "--color-border",
  "--color-border-control",
  "--color-border-strong",
  "--color-focus-ring",
  "--color-action",
  "--color-action-hover",
  "--color-action-subtle",
  "--color-action-subtle-text",
  ...["success", "danger", "warning", "info"].flatMap((role) =>
    ["surface", "border", "text", "fill"].map(
      (slot) => `--color-${role}-${slot}`,
    ),
  ),
] as const;

const SCALE_TOKENS = [
  ...["0", "1", "2", "3", "4", "5", "6", "8", "10", "12", "16", "20", "24"].map(
    (step) => `--space-${step}`,
  ),
  ...["sm", "md", "lg", "xl", "2xl", "full"].map((step) => `--radius-${step}`),
  ...[
    "display",
    "h1",
    "h2",
    "h3",
    "h4",
    "body-lg",
    "body",
    "body-sm",
    "caption",
    "overline",
    "mono",
  ].map((step) => `--text-${step}-size`),
  "--shadow-popover",
  "--shadow-overlay",
  ...["instant", "fast", "base", "slow"].map((step) => `--duration-${step}`),
  ...["out", "in", "spring"].map((step) => `--ease-${step}`),
  ...["base", "sticky", "rail", "header", "popover", "overlay", "toast"].map(
    (step) => `--z-${step}`,
  ),
] as const;

function walkSource(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) {
      walkSource(absolute, out);
      continue;
    }
    if (/\.(tsx?|css)$/u.test(entry)) out.push(absolute);
  }
  return out;
}

// This file names both `--og-*` and `dark:` on purpose, so it excludes itself
// and `globals.css` from the scans below.
const TEST_PATH = fileURLToPath(import.meta.url);
const sourceFiles = walkSource(SOURCE_ROOT).filter(
  (file) => file !== GLOBALS_PATH && file !== TEST_PATH,
);
const relativeToSource = (file: string) =>
  relative(SOURCE_ROOT, file).split(sep).join("/");

describe("token layers", () => {
  it("declares every ramp of DESIGN.md §2.1 as a primitive", () => {
    const expected = [
      ...[0, 25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map(
        (step) => `--og-neutral-${step}`,
      ),
      ...[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map(
        (step) => `--og-green-${step}`,
      ),
      ...[50, 100, 600, 700].flatMap((step) => [
        `--og-red-${step}`,
        `--og-amber-${step}`,
        `--og-blue-${step}`,
      ]),
    ];
    expect([...primitives.keys()].sort()).toEqual(expected.sort());
  });

  it("maps every semantic name of DESIGN.md §2.2, and nothing beyond it", () => {
    for (const name of SEMANTIC_COLOUR_NAMES) {
      expect(semantics.has(name), `${name} is missing`).toBe(true);
    }
    expect([...semantics.keys()].sort()).toEqual(
      [...SEMANTIC_COLOUR_NAMES].sort(),
    );
  });

  it("declares the space, radius, type, elevation, motion and layering scales", () => {
    for (const token of SCALE_TOKENS) {
      expect(globals, `${token} is missing`).toMatch(
        new RegExp(`${token}:\\s*\\S`, "u"),
      );
    }
  });

  it("bridges every semantic name into Tailwind through @theme inline", () => {
    const themeBlocks = [...globals.matchAll(/@theme inline\s*\{/gu)];
    expect(themeBlocks.length).toBeGreaterThan(0);
    for (const name of SEMANTIC_COLOUR_NAMES) {
      expect(globals, `${name} is not bridged`).toContain(
        `${name}: var(${name});`,
      );
    }
  });

  it("keeps primitives inside globals.css", () => {
    const offenders = sourceFiles
      .filter((file) => /--og-[a-z0-9-]/u.test(readFileSync(file, "utf8")))
      .map(relativeToSource);
    expect(offenders).toEqual([]);
  });
});

describe("the dead dark theme", () => {
  it("has no .dark block and no dark variant", () => {
    expect(globals).not.toContain(".dark");
    expect(globals).not.toContain("@custom-variant dark");
  });

  it("has no dark: utility anywhere in the app", () => {
    const offenders = sourceFiles
      .filter((file) => /\bdark:[a-z[]/u.test(readFileSync(file, "utf8")))
      .map(relativeToSource);
    expect(offenders).toEqual([]);
  });

  it("no longer ships shadcn's unbranded purple sidebar primary", () => {
    expect(globals).not.toContain("--sidebar-primary");
    expect(globals).not.toContain("oklch(0.488 0.243 264.376)");
  });

  it("leaves no Tailwind palette utility in the app", () => {
    const palette =
      /\b(?:bg|text|border|ring|fill|stroke|outline|from|to|via|decoration|shadow|divide|accent|caret|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|\d{3})\b/u;
    const offenders = sourceFiles
      .filter(
        (file) =>
          file.endsWith(".tsx") && palette.test(readFileSync(file, "utf8")),
      )
      .map(relativeToSource);
    expect(offenders).toEqual([]);
  });
});

describe("measured contrast", () => {
  it("clears 4.5 for every text colour the system puts on a surface", () => {
    expect(ratioOf("--color-text", "--color-surface")).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      ratioOf("--color-text-heading", "--color-surface"),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      ratioOf("--color-text-secondary", "--color-surface"),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      ratioOf("--color-text-muted", "--color-surface"),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      ratioOf("--color-text-link", "--color-surface"),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      ratioOf("--color-text-link-hover", "--color-surface"),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      ratioOf("--color-text-on-fill", "--color-surface-inverse"),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("clears 3.0 for every boundary that identifies a control", () => {
    expect(
      ratioOf("--color-border-control", "--color-surface"),
    ).toBeGreaterThanOrEqual(3);
    expect(
      ratioOf("--color-border-strong", "--color-surface"),
    ).toBeGreaterThanOrEqual(3);
    expect(
      ratioOf("--color-focus-ring", "--color-surface"),
    ).toBeGreaterThanOrEqual(3);
    // The focus ring has to be visible on a sunken rail too, not only on white.
    expect(
      ratioOf("--color-focus-ring", "--color-surface-sunken"),
    ).toBeGreaterThanOrEqual(3);
  });

  it("clears 4.5 for every button fill against its own text", () => {
    const fills: ReadonlyArray<readonly [string, string, string]> = [
      ["primary", "--color-action", "--color-text-on-fill"],
      ["primary hover", "--color-action-hover", "--color-text-on-fill"],
      ["secondary", "--color-surface", "--color-text"],
      ["subtle", "--color-action-subtle", "--color-action-subtle-text"],
      ["ghost", "--color-surface", "--color-text-secondary"],
      ["danger", "--color-danger-fill", "--color-text-on-fill"],
    ];
    for (const [variant, fill, ink] of fills) {
      expect(ratioOf(fill, ink), `${variant} button`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it("clears 4.5 for every status text on its own status surface", () => {
    for (const role of ["success", "danger", "warning", "info"]) {
      expect(
        ratioOf(`--color-${role}-text`, `--color-${role}-surface`),
        `${role} text on ${role} surface`,
      ).toBeGreaterThanOrEqual(4.5);
    }
    // A warning is ink on a surface, never white on an amber fill.
    expect(
      ratioOf("--color-text", "--color-warning-surface"),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      ratioOf("--color-warning-fill", "--color-text-on-fill"),
    ).toBeLessThan(4.5);
  });

  it("keeps disabled text and dividers honest about what they are", () => {
    // `text-disabled` is exempt from 1.4.3 and must stay visibly inactive.
    expect(ratioOf("--color-text-disabled", "--color-surface")).toBeLessThan(
      4.5,
    );
    // A divider identifies nothing, so it is allowed to sit under 3:1 — and
    // that is exactly why it may never carry a control boundary.
    expect(ratioOf("--color-border", "--color-surface")).toBeLessThan(3);
  });
});

describe("the two traps a later tidy-up must not reintroduce", () => {
  it("does not map muted text to neutral-500", () => {
    // 4.18 against white: a border and placeholder colour, not body text.
    expect(semantics.get("--color-text-muted")).not.toBe("--og-neutral-500");
    expect(semantics.get("--color-text-muted")).toBe("--og-neutral-600");
    expect(
      contrastRatio(
        primitives.get("--og-neutral-500") as LinearRgb,
        primitives.get("--og-neutral-0") as LinearRgb,
      ),
    ).toBeLessThan(4.5);
  });

  it("does not map a control border to neutral-200", () => {
    // 1.28 against white: it fails WCAG 2.2 1.4.11's 3:1 for a boundary that
    // identifies a component, and stays available as a decorative divider.
    expect(semantics.get("--color-border-control")).not.toBe(
      "--og-neutral-200",
    );
    expect(semantics.get("--color-border-control")).toBe("--og-neutral-500");
    expect(semantics.get("--color-border")).toBe("--og-neutral-200");
    expect(
      contrastRatio(
        primitives.get("--og-neutral-200") as LinearRgb,
        primitives.get("--og-neutral-0") as LinearRgb,
      ),
    ).toBeLessThan(3);
  });
});

describe("global responsive floor", () => {
  it("owns proportional and monospace typography through semantic tokens", () => {
    expect(globals).toMatch(
      /--font-overgarden-sans:\s*var\(--font-google-sans\),\s*Arial,/u,
    );
    expect(globals).toMatch(
      /--font-overgarden-mono:\s*var\(--font-geist-mono\)/u,
    );
    expect(globals).toContain("--font-sans: var(--font-overgarden-sans);");
    expect(globals).toContain("--font-heading: var(--font-overgarden-sans);");
    expect(globals).toContain("--font-mono: var(--font-overgarden-mono);");
    expect(globals).toContain("font-optical-sizing: auto;");
    expect(globals).toContain("font-synthesis: none;");
    expect(globals).toContain('[contenteditable="true"]');
    expect(globals).not.toContain("--font-geist-sans");
  });

  it("does not force 320px content beyond a viewport narrowed by classic scrollbars", () => {
    expect(globals).not.toContain("min-width: 20rem");
  });

  it("lets the site header grow around 200% text without shrinking controls", () => {
    expect(globals).toContain(
      ".site-shell-header-inner {\n  min-height: 56px;",
    );
    expect(globals).not.toContain(
      ".site-shell-header-inner {\n  height: 56px;",
    );
  });

  it("still collapses every duration for a reader who asked for less motion", () => {
    expect(globals).toContain("@media (prefers-reduced-motion: reduce)");
    expect(globals).toContain("animation-duration: 0.01ms !important;");
    expect(globals).toContain("transition-duration: 0.01ms !important;");
    expect(globals).toContain("animation-iteration-count: 1 !important;");
  });
});
