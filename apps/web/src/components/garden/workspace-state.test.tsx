import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { failedSection } from "@/server/workspace-failure";
import {
  WorkspaceAccessPanel,
  WorkspaceMissingRecord,
  WorkspaceSectionError,
  WorkspaceSectionSkeleton,
  WorkspaceShell,
  workspaceSchemaMissingHint,
} from "./workspace-state";

describe("WorkspaceShell", () => {
  it("names its surface and marks only the skeleton copy as loading", () => {
    const page = renderToStaticMarkup(
      <WorkspaceShell surface="profile" locale="uk" title="Мій профіль" />,
    );
    const fallback = renderToStaticMarkup(
      <WorkspaceShell
        surface="profile"
        locale="uk"
        state="loading"
        title="Мій профіль"
      />,
    );

    expect(page).toContain('data-workspace-surface="profile"');
    expect(page).toContain("<h1");
    expect(page).not.toContain('data-workspace-state="loading"');
    expect(fallback).toContain('data-workspace-state="loading"');
    expect(fallback).toContain('aria-busy="true"');
    // Fallback and page carry the same heading, so nothing moves on arrival.
    expect(fallback).toContain("Мій профіль");
  });
});

describe("WorkspaceSectionError", () => {
  it("carries the class as an attribute and the digest as the only code on screen", () => {
    const failure = failedSection("connection_unavailable", {
      code: "ECONNREFUSED",
    });
    const html = renderToStaticMarkup(
      <WorkspaceSectionError
        locale="uk"
        failure={failure}
        retryHref="/garden"
      />,
    );

    expect(html).toContain('data-section-failure="connection_unavailable"');
    expect(html).toContain(failure.digest);
    expect(html).not.toContain("ECONNREFUSED");
    expect(html).not.toContain("connection_unavailable<");
  });

  it("offers a working link before hydration", () => {
    const html = renderToStaticMarkup(
      <WorkspaceSectionError
        locale="uk"
        failure={failedSection("query_timeout")}
        retryHref="/garden/profile"
      />,
    );

    expect(html).toContain('href="/garden/profile"');
    expect(html).toContain('data-workspace-retry="section"');
  });

  it.each(["uk", "bg", "ru"] as const)(
    "explains the failure in %s without a machine code",
    (locale) => {
      const html = renderToStaticMarkup(
        <WorkspaceSectionError
          locale={locale}
          failure={failedSection("schema_missing", { relation: "spaces" })}
          retryHref="/garden"
        />,
      );

      expect(html).toContain(`data-section-failure="schema_missing"`);
      expect(html).not.toContain("schema_missing<");
      expect(html).not.toContain("spaces");
    },
  );
});

describe("workspaceSchemaMissingHint", () => {
  it("names the relation for a missing one and nothing for any other class", () => {
    expect(
      workspaceSchemaMissingHint(
        "uk",
        failedSection("schema_missing", { relation: "catalog_editions" }),
      ),
    ).toContain("catalog_editions");
    expect(
      workspaceSchemaMissingHint("uk", failedSection("schema_missing")),
    ).toContain("MIGRATION_ALLOCATION");
    expect(
      workspaceSchemaMissingHint("uk", failedSection("query_timeout")),
    ).toBeNull();
  });
});

describe("WorkspaceSectionSkeleton", () => {
  it("mirrors the section it precedes and marks itself as a fallback", () => {
    const html = renderToStaticMarkup(
      <WorkspaceSectionSkeleton locale="uk" title="Живі об'єкти" rows={4} />,
    );

    expect(html).toContain('data-workspace-section="loading"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Живі об");
    // The watchdog is silent on the server: a first paint carries no apology.
    expect(html).toContain('data-workspace-watchdog="none"');
    expect(html).not.toContain("усе ще завантажується");
  });
});

describe("WorkspaceAccessPanel", () => {
  it("stamps the surface's own published state attribute", () => {
    const html = renderToStaticMarkup(
      <WorkspaceAccessPanel
        locale="uk"
        surface="stable-registry-editions"
        stateAttribute="data-edition-state"
        state="denied"
        title="Видання"
        message="Доступ до видань заборонено."
      />,
    );

    expect(html).toContain('data-edition-state="denied"');
    expect(html).toContain('data-workspace-surface="stable-registry-editions"');
    expect(html).not.toContain("data-section-failure");
  });

  it("carries the class and digest when the answer could not be read", () => {
    const failure = failedSection("connection_unavailable");
    const html = renderToStaticMarkup(
      <WorkspaceAccessPanel
        locale="uk"
        surface="stable-registry"
        stateAttribute="data-release-center-state"
        state="unavailable"
        title="Stable Registry"
        message="Центр випусків зараз недоступний."
        failure={failure}
        retryHref="/garden/catalog/registry"
      />,
    );

    expect(html).toContain('data-release-center-state="unavailable"');
    expect(html).toContain('data-section-failure="connection_unavailable"');
    expect(html).toContain(failure.digest);
  });
});

describe("WorkspaceMissingRecord", () => {
  it("says the same thing whether the record is absent or someone else's", () => {
    const html = renderToStaticMarkup(<WorkspaceMissingRecord locale="uk" />);

    expect(html).toContain('data-workspace-record="missing"');
    expect(html).toContain('href="/garden"');
    expect(html).not.toContain("data-section-failure");
  });
});
