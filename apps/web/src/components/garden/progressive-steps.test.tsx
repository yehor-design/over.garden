// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { openStep } from "./progressive-steps";

function renderStep() {
  render(
    <ol>
      <li data-state="done">
        <h2 tabIndex={-1}>Як називається простір?</h2>
      </li>
      <li data-state="active">
        <h2 tabIndex={-1}>Перевірте й створіть</h2>
      </li>
    </ol>,
  );
  const heading = screen.getByRole("heading", {
    name: "Перевірте й створіть",
  });
  return { heading, step: heading.closest("li")! };
}

describe("openStep", () => {
  it("focuses the question without its own scroll, and brings the step to the top", () => {
    // `OVE-505`: focus alone scrolled only as far as it had to, and left the
    // answered step above resting half under the sticky header.
    const { heading, step } = renderStep();
    const focus = vi.spyOn(heading, "focus");
    const scrollIntoView = vi.fn();
    step.scrollIntoView = scrollIntoView;

    openStep(heading);

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(heading);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  });

  it("still focuses where a document has no layout to scroll", () => {
    const { heading, step } = renderStep();
    Object.defineProperty(step, "scrollIntoView", { value: undefined });

    expect(() => openStep(heading)).not.toThrow();
    expect(document.activeElement).toBe(heading);
  });

  it("does nothing without a target", () => {
    expect(() => openStep(null)).not.toThrow();
  });
});
