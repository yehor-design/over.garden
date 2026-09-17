import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import { checkComponentTestSource } from "./check-component-tests";
import {
  ALLOWED_PRIMITIVE_READERS,
  runDesignTokenGate,
  scanForPrimitives,
} from "./check-design-tokens";

/**
 * Every gate of `DESIGN.md` §10, observed red.
 *
 * A check that has never been seen fail is indistinguishable from one that
 * cannot fail. This repository has paid for that twice — a CI step that ended
 * at `exit code 1` with no output, and a release pipeline that refused
 * seventy-eight correct builds for a week because the expectation was wrong —
 * so each fixture in `scripts/design-gate-fixtures/` violates one rule on
 * purpose and this file runs the **real** gate over it.
 *
 * The fixtures carry a `.fixture` suffix so `pnpm lint`, `tsc` and `next build`
 * never see them; the source is read here and handed to ESLint under a
 * synthetic path inside `src/`, which is the path the config is written for.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FIXTURES = join(ROOT, "scripts", "design-gate-fixtures");

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, `${name}.fixture`), "utf8");
}

const eslint = new ESLint({ cwd: ROOT });

async function lintAs(filePath: string, name: string) {
  const [result] = await eslint.lintText(fixture(name), {
    filePath: join(ROOT, filePath),
    warnIgnored: false,
  });
  return (result?.messages ?? []).filter(
    (message) => message.ruleId === "no-restricted-syntax",
  );
}

describe("gate 1 — no palette utility, hex or oklch() in a component", () => {
  it("flags a Tailwind palette utility, and says what to write instead", async () => {
    const messages = await lintAs(
      "src/components/gate-fixture.tsx",
      "palette-utility.tsx",
    );
    // Three violations, one message each: a `cva()` recipe, a bare constant,
    // and `text-white` in an attribute — `white` carries no step and slipped
    // through the whole of OVE-439. Exactly three, because a selector that
    // matches the same literal twice prints the same error twice, and a gate
    // whose output is padded is a gate people learn to skim.
    expect(messages).toHaveLength(3);
    expect(messages[0]?.message).toContain("DESIGN.md §2.2");
    expect(messages[0]?.line).toBeGreaterThan(0);
  });

  it("flags a hex colour", async () => {
    const messages = await lintAs(
      "src/components/gate-fixture.tsx",
      "hex-colour.tsx",
    );
    expect(messages.map((message) => message.message).join(" ")).toContain(
      "globals.css",
    );
  });

  it("flags an oklch() literal", async () => {
    const messages = await lintAs(
      "src/components/gate-fixture.tsx",
      "oklch-literal.tsx",
    );
    expect(messages.map((message) => message.message).join(" ")).toContain(
      "primitive layer",
    );
  });

  it("flags them inside `components/ui` too — a primitive is a defect there as well", async () => {
    const messages = await lintAs(
      "src/components/ui/gate-fixture.tsx",
      "palette-utility.tsx",
    );
    expect(messages.length).toBeGreaterThan(0);
  });
});

describe("gate 2 — no arbitrary value, but every arbitrary variant stays", () => {
  it("flags a magic number", async () => {
    const messages = await lintAs(
      "src/components/gate-fixture.tsx",
      "arbitrary-value.tsx",
    );
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]?.message).toContain("token");
  });

  it("does not flag a selector, a property list, or a calc over a token", async () => {
    // The failure mode this guards against is a rule that fails on a clean
    // tree, which is not shippable. Every string in this fixture exists in the
    // product today and every one of them is correct.
    const messages = await lintAs(
      "src/components/gate-fixture.tsx",
      "arbitrary-variant.tsx",
    );
    expect(messages).toEqual([]);
  });
});

describe("gate 4 — no raw control outside components/ui", () => {
  it("flags a hand-rolled input, select and textarea", async () => {
    const messages = await lintAs(
      "src/components/gate-fixture.tsx",
      "raw-control.tsx",
    );
    expect(messages).toHaveLength(3);
    expect(messages[0]?.message).toContain("components/ui");
  });

  it("allows them inside components/ui, which is where a control is built", async () => {
    const messages = await lintAs(
      "src/components/ui/gate-fixture.tsx",
      "raw-control.tsx",
    );
    expect(messages).toEqual([]);
  });
});

describe("gate 5 — no z-index literal", () => {
  it("flags a layer invented on the spot, and names the scale", async () => {
    const messages = await lintAs(
      "src/components/gate-fixture.tsx",
      "z-index-literal.tsx",
    );
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]?.message).toContain("z-header");
  });
});

describe("the control case", () => {
  it("passes clean source under every gate", async () => {
    expect(
      await lintAs("src/components/gate-fixture.tsx", "clean.tsx"),
    ).toEqual([]);
  });
});

describe("gate 3 — no primitive outside globals.css", () => {
  it("flags a primitive, with its file, its line and the token", () => {
    const violations = scanForPrimitives(
      "src/lib/gate-fixture.ts",
      fixture("primitive-token.ts"),
    );
    expect(violations).toEqual([
      { file: "src/lib/gate-fixture.ts", line: 2, token: "--og-neutral-600" },
    ]);
  });

  it("passes source that uses the semantic layer", () => {
    expect(
      scanForPrimitives("src/lib/gate-fixture.ts", fixture("clean.tsx")),
    ).toEqual([]);
  });

  it("refuses an allowance that no longer excuses anything", () => {
    // A list that can grow but never shrink stops being a list of exceptions.
    const report = runDesignTokenGate(ROOT);
    expect(report.violations).toEqual([]);
    for (const reader of ALLOWED_PRIMITIVE_READERS) {
      expect(
        readFileSync(join(ROOT, reader), "utf8"),
        `${reader} is allow-listed but names no primitive`,
      ).toMatch(/--og-[a-z0-9-]+/u);
    }
  });
});

describe("gate 6 — every ui component has a role-and-name test", () => {
  it("refuses a test that renders and asserts but never asks by role", () => {
    const failures = checkComponentTestSource(
      "src/components/ui/untested-component.tsx",
      "src/components/ui/untested-component.test.tsx",
      fixture("untested-component.test.tsx"),
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toBe("no_role_query");
    expect(failures[0]?.expected).toContain("getByRole");
  });

  it("accepts a test that asks by role and by accessible name", () => {
    const failures = checkComponentTestSource(
      "src/components/ui/button.tsx",
      "src/components/ui/button.test.tsx",
      readFileSync(
        join(ROOT, "src", "components", "ui", "button.test.tsx"),
        "utf8",
      ),
    );
    expect(failures).toEqual([]);
  });

  it("refuses a nameless-component entry once its test does assert a name", () => {
    // The allow-list cannot outlive its reason: an entry that is no longer
    // needed fails the gate rather than sitting there.
    const failures = checkComponentTestSource(
      "src/components/ui/badge.tsx",
      "src/components/ui/badge.test.tsx",
      `screen.getByRole("status", { name: "Видалено" });`,
      { nameless: "a badge is its own text" },
    );
    expect(failures[0]?.reason).toBe("stale_nameless_entry");
  });
});
