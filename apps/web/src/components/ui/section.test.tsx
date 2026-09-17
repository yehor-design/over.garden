// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Section } from "./section";

describe("Section", () => {
  it("is a named region, because an unnamed section is a div", () => {
    render(
      <Section id="recent" title="Останні записи" description="За цей тиждень">
        <p>Томат</p>
      </Section>,
    );
    const region = screen.getByRole("region", { name: "Останні записи" });
    expect(region.tagName).toBe("SECTION");
    expect(
      screen.getByRole("heading", { level: 2, name: "Останні записи" }),
    ).not.toBeNull();
    expect(screen.getByText("За цей тиждень")).not.toBeNull();
  });

  it("drops to h3 when it sits inside another section", () => {
    render(
      <Section id="nested" title="Підрозділ" level={3}>
        <p>Томат</p>
      </Section>,
    );
    expect(
      screen.getByRole("heading", { level: 3, name: "Підрозділ" }),
    ).not.toBeNull();
  });
});
