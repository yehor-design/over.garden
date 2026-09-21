// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Illustration } from "./illustration";
import { resolveIllustrationRole } from "@/lib/illustrations";

describe("decorative illustration", () => {
  it("does not add a redundant accessible image or an eager network request", () => {
    const { container } = render(
      <Illustration
        asset={resolveIllustrationRole("object-setup")}
        size="card"
      />,
    );
    const image = container.querySelector("img")!;
    expect(screen.queryByRole("img")).toBeNull();
    expect(image.getAttribute("alt")).toBe("");
    expect(image.getAttribute("loading")).toBe("lazy");
    expect(image.getAttribute("width")).toBe("96");
    expect(image.getAttribute("height")).toBe("96");
    expect(image.src).not.toContain("thiings.co");
  });
});
