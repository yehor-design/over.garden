// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProfileHeader } from "./profile-header";

describe("ProfileHeader", () => {
  it("names the gardener once, at the level the page asked for", () => {
    render(
      <ProfileHeader
        eyebrow="Профіль садівника"
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

  it("drops a level where it is embedded rather than outranking the page", () => {
    render(
      <ProfileHeader
        displayName="Олена"
        handle="@olena"
        headingLevel="h3"
      />,
    );

    expect(
      screen.getByRole("heading", { level: 3, name: "Олена" }),
    ).not.toBeNull();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("prints the counts that are true and omits the ones that are not", () => {
    render(
      <ProfileHeader
        displayName="Олена"
        handle="@olena"
        counts={[
          { label: "Записи", value: 18 },
          // Zero is not news, and hidden is not zero: a visitor who cannot
          // see a gardener's relationships should read nothing rather than
          // a blank or a misleading 0.
          { label: "Об’єкти", value: 0 },
          { label: "Стежать", value: null },
          { label: "Чернетки", value: 3, privateNote: "лише ви" },
        ]}
      />,
    );

    expect(screen.getByText("18")).not.toBeNull();
    expect(screen.getByText("Записи")).not.toBeNull();
    expect(screen.queryByText("Об’єкти")).toBeNull();
    expect(screen.queryByText("Стежать")).toBeNull();
    expect(screen.getByText("(лише ви)")).not.toBeNull();
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
