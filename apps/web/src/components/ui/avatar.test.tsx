// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Avatar, AvatarGroup } from "./avatar";

describe("Avatar", () => {
  it("shows an initial when there is no picture, and says nothing twice", () => {
    const { container } = render(<Avatar name="Олена" />);
    expect(container.textContent).toBe("О");
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("reads past the mention sign, which every gardener shares", () => {
    // A gardener who has set no display name is shown as their mention, so
    // the fallback would otherwise be `@` on every such profile.
    const { container } = render(<Avatar name="@olena_garden" />);
    expect(container.textContent).toBe("O");
  });

  it("keeps the picture decorative, because the name is beside it", () => {
    const { container } = render(
      <Avatar name="Олена" src="https://media.over.garden/a.webp" />,
    );
    const image = container.querySelector("img");
    expect(image?.getAttribute("alt")).toBe("");
  });

  it("carries a name of its own where it stands alone", () => {
    render(<Avatar name="Олена" label="Олена" />);
    expect(screen.getByRole("img", { name: "Олена" })).not.toBeNull();
  });
});

describe("AvatarGroup", () => {
  it("is one image with one name, not three initials in a row", () => {
    render(
      <AvatarGroup label="Три садівники" overflow={2}>
        <Avatar name="Олена" />
        <Avatar name="Богдан" />
      </AvatarGroup>,
    );
    const group = screen.getByRole("img", { name: "Три садівники" });
    expect(group.textContent).toContain("+2");
    expect(screen.queryAllByRole("img")).toHaveLength(1);
  });
});
