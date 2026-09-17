// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  WORKSPACE_FAILURE_CLASSES,
  failedSection,
} from "@/server/workspace-failure";
import { ErrorState } from "./error-state";

describe("ErrorState", () => {
  // Imported from the module rather than retyped: adding a class there makes
  // this fail instead of silently rendering nothing for it.
  it.each(WORKSPACE_FAILURE_CLASSES)("renders the %s class", (failureClass) => {
    const failure = failedSection(failureClass, { code: "42P01" });
    const { container } = render(
      <ErrorState
        failureClass={failure.failureClass}
        digest={failure.digest}
        title="Цей блок зараз недоступний"
        description="Спробуйте ще раз за хвилину."
        retryHref="/garden"
        retryLabel="Спробувати ще раз"
      />,
    );
    const section = container.querySelector("[data-section-failure]");
    expect(section?.getAttribute("data-section-failure")).toBe(failureClass);
    expect(container.textContent).toContain(failure.digest);
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Цей блок зараз недоступний",
      }),
    ).not.toBeNull();
    expect(
      screen.getByRole("link", { name: "Спробувати ще раз" }),
    ).not.toBeNull();
  });

  it("never puts the machine class or the driver code on screen", () => {
    const failure = failedSection("connection_unavailable", {
      code: "ECONNREFUSED",
    });
    const { container } = render(
      <ErrorState
        failureClass={failure.failureClass}
        digest={failure.digest}
        title="Цей блок зараз недоступний"
      />,
    );
    expect(container.textContent).not.toContain("ECONNREFUSED");
    expect(container.textContent).not.toContain("connection_unavailable");
  });

  it("carries the page's h1 when the failure is the page", () => {
    render(
      <ErrorState
        headingLevel={1}
        failureClass="unknown"
        digest="1A2B3C4"
        title="Щось пішло не так"
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Щось пішло не так" }),
    ).not.toBeNull();
  });

  it("takes the page's own retry control when it has one", () => {
    render(
      <ErrorState
        failureClass="unknown"
        digest="1A2B3C4"
        title="Щось пішло не так"
        retry={<button type="button">Оновити</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Оновити" })).not.toBeNull();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
