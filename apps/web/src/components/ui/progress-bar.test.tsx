// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProgressBar } from "./progress-bar";

describe("ProgressBar", () => {
  it("reports its bounds and its value, not just a coloured rectangle", () => {
    render(<ProgressBar label="Завантаження фото" value={40} />);
    const bar = screen.getByRole("progressbar", { name: "Завантаження фото" });
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
  });

  it("clamps a value outside its own bounds", () => {
    const { rerender } = render(
      <ProgressBar label="Завантаження" value={-5} />,
    );
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "0",
    );
    rerender(<ProgressBar label="Завантаження" value={140} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "100",
    );
  });
});
