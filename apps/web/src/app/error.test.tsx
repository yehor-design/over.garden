import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SiteShellLocaleProvider } from "@/components/site-shell/site-shell-locale-context";
import ErrorPage from "./error";

describe("root error state", () => {
  it("uses the shell locale and offers an explicit retry action", () => {
    const html = renderToStaticMarkup(
      <SiteShellLocaleProvider locale="ru">
        <ErrorPage error={new Error("private diagnostic")} reset={vi.fn()} />
      </SiteShellLocaleProvider>,
    );

    expect(html).toContain('data-site-shell-state="error"');
    expect(html).toContain("Не удалось загрузить эту страницу");
    expect(html).toContain("Повторить");
    expect(html).not.toContain("private diagnostic");
  });
});
