// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProfileHeader } from "./profile-header";

describe("ProfileHeader", () => {
  it("names the gardener once, at the level the page asked for", () => {
    render(
      <ProfileHeader
        displayName="Олена · міський сад"
        handle="@olena"
        bio="Вирощую їстівний балкон."
        action={<button type="button">Стежити</button>}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Олена · міський сад" }),
    ).not.toBeNull();
    expect(screen.getByText("@olena")).not.toBeNull();
    expect(screen.getByText("Вирощую їстівний балкон.")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Стежити" })).not.toBeNull();
  });

  it("puts nothing above the name (OVE-494)", () => {
    const { container } = render(
      <ProfileHeader displayName="Олена" handle="@olena" />,
    );

    const header = container.querySelector('[data-slot="profile-header"]');
    // The first text in the header is the gardener's name: no overline.
    expect(header?.textContent?.startsWith("Олена")).toBe(true);
  });

  it("drops a level where it is embedded rather than outranking the page", () => {
    render(
      <ProfileHeader displayName="Олена" handle="@olena" headingLevel="h3" />,
    );

    expect(
      screen.getByRole("heading", { level: 3, name: "Олена" }),
    ).not.toBeNull();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("keeps a long bio whole, in the gardener's own line breaks", () => {
    const bio = `${"Балкон на сході, ".repeat(30)}\nДругий рядок.`;
    const { container } = render(
      <ProfileHeader displayName="Олена" handle="@olena" bio={bio} />,
    );

    const paragraph = container.querySelector("[data-profile-bio]");
    expect(paragraph?.textContent).toBe(bio);
    expect(paragraph?.className).toContain("whitespace-pre-line");
    expect(paragraph?.className).toContain("break-words");
  });

  it("prints the counts it is given as words, and nothing when there are none", () => {
    const { container, rerender } = render(
      <ProfileHeader
        displayName="Олена"
        handle="@olena"
        counts={["12 підписників", "3 підписки"]}
      />,
    );

    const counts = container.querySelector("[data-profile-counts]");
    expect(counts?.querySelectorAll("li")).toHaveLength(2);
    expect(counts?.textContent).toContain("12 підписників");

    rerender(<ProfileHeader displayName="Олена" handle="@olena" counts={[]} />);
    expect(container.querySelector("[data-profile-counts]")).toBeNull();
  });

  it("falls back to initials when a gardener has no picture", () => {
    const { container } = render(
      <ProfileHeader displayName="Олена Ткач" handle="@olena" />,
    );

    // The avatar is decorative — the name beside it carries the meaning — so
    // it exposes no role and no alternative text of its own.
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector('[data-slot="avatar"]')).not.toBeNull();
  });
});
