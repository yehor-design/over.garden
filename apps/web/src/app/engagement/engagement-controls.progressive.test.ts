import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * A public control must work with JavaScript switched off.
 *
 * React gives a `<form>` a real endpoint only when its `action` is a Server
 * Action reference — including the `formAction` that `useActionState` derives
 * from one. Hand it any other function and React renders
 * `action="javascript:throw new Error('React form unexpectedly submitted.')"`,
 * a placeholder it replaces on hydration and never before.
 *
 * That shipped on 2026-09-04. The like control wrapped its Server Action in a
 * client closure; the page's subtree did not hydrate in production; pressing
 * Like produced no request, no change, and no error. This check is the standing
 * guard, and it reads the source because the defect is invisible in a unit
 * render: outside Next's pipeline every form renders the placeholder, so a
 * rendered-HTML assertion would fail for both the correct and the broken shape.
 */

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "engagement-controls.tsx"),
  "utf8",
);

describe("public engagement controls work without JavaScript", () => {
  const formActions = [...source.matchAll(/<form\s+action=\{([^}]*)\}/g)].map(
    (match) => match[1]!.trim(),
  );

  it("has a form for every control", () => {
    expect(formActions.length).toBeGreaterThanOrEqual(4);
  });

  it("passes a Server Action reference, never a client closure", () => {
    for (const action of formActions) {
      // An identifier, and nothing else. `(formData) => …`, `async () => …`,
      // and `submit.bind(null, x)` all lose the no-JavaScript endpoint.
      expect(
        action,
        `<form action={${action}}> must be a bare formAction identifier`,
      ).toMatch(/^[A-Za-z_$][\w$]*$/);
    }
  });

  it("derives every form action from useActionState", () => {
    for (const action of formActions) {
      expect(source).toContain(`const [state, ${action}] = useActionState(`);
    }
  });

  it("carries the target in the form rather than in a closure", () => {
    // `formData` is the only channel a browser without JavaScript has.
    expect(source).toContain('name="targetKind"');
    expect(source).toContain('name="targetRef"');
  });
});
