import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { getPublicKnowledgeCopy } from "@/lib/public-knowledge-copy";
import {
  PublicKnowledgeHub,
  type PublicKnowledgeHubItem,
} from "./public-knowledge-hub";

const items: PublicKnowledgeHubItem[] = [
  {
    kind: "guide",
    path: "/guides/visual-seasonal-observation",
    title: "Як порівняти два спостереження без зайвих припущень",
    description: "Авторський порядок перевірки однієї зміни за раз.",
    objectKinds: ["plant"],
    evidenceCount: 11,
    updatedDate: "2026-07-10",
    indexable: true,
  },
  {
    kind: "answer",
    path: "/answers/visual-long-recovery-answer",
    title: "Що перевірити після стресу?",
    description: "Коротка відповідь із датованим follow-up.",
    objectKinds: ["plant", "animal"],
    evidenceCount: 8,
    updatedDate: "2026-07-09",
    indexable: true,
  },
  {
    kind: "topic",
    path: "/topics/care-checks",
    title: "Регулярні спостереження",
    description: "Публічний досвід рослин, тварин і бджолосімей.",
    objectKinds: ["plant", "animal"],
    evidenceCount: 11,
    updatedDate: "2026-07-10",
    indexable: true,
  },
];

describe("PublicKnowledgeHub", () => {
  it("renders dense localized filters, distinct trust states, and route-owned context", () => {
    const html = renderToStaticMarkup(
      <PublicKnowledgeHub
        locale="uk"
        copy={getPublicKnowledgeCopy("uk")}
        request={{ query: "", type: "all", kind: "all" }}
        items={items}
        contextItems={items}
        state="ready"
      />,
    );

    expect(html).toContain('data-public-knowledge-hub="true"');
    expect(html).toContain('data-public-knowledge-state="ready"');
    // The same bar `/journals` and `/catalog` use (`OVE-453`): one real GET
    // form, one parameter per facet, applying on change once hydrated.
    expect(html).toContain('data-filter-bar-form="true"');
    expect(html).toContain('method="get"');
    expect(html).toContain('name="q"');
    expect(html).toContain('data-filter-bar-facet="type"');
    expect(html).toContain('data-filter-bar-modes="true"');
    expect(html).toContain('href="/knowledge?kind=plant"');
    expect(html).toContain('name="type"');
    // A list of things is a list, and the count survives a filter change in
    // one live region rather than arriving with a fresh document.
    expect(html).toContain('data-slot="list-row"');
    expect(html).toMatch(
      /data-knowledge-result-count="true"[^>]*aria-live="polite"/u,
    );
    expect(html).toContain("Авторський матеріал");
    expect(html).toContain("Досвід із публічних журналів");
    expect(html).toContain("11 публічних записів");
    expect(html).toContain("/guides/visual-seasonal-observation");
    expect(html).toContain("/topics/care-checks");
    expect(html).toContain('data-site-shell-context="route-owned"');
    // The way into the catalogue says what its door does (`OVE-496`): a
    // reader asking what something is has a name, not a kingdom.
    const catalogue = html.slice(
      html.indexOf('data-catalog-front-door="true"'),
    );
    expect(
      /<a [^>]*data-catalog-front-door="true"[^>]*>/u.exec(html)?.[0],
    ).toContain('href="/catalog"');
    expect(catalogue).toContain("Знайдіть рослину чи тварину");
    expect(catalogue).toContain("За звичною чи науковою назвою");
    expect(html).not.toContain("/garden");
    // Nothing here reaches for the pre-redesign palette any more.
    expect(html).not.toContain("text-muted-foreground");
    expect(html).not.toContain("text-foreground");
  });

  it("renders honest loading, error, and zero-result states", () => {
    const copy = getPublicKnowledgeCopy("bg");
    const render = (state: "loading" | "error" | "empty") =>
      renderToStaticMarkup(
        <PublicKnowledgeHub
          locale="bg"
          copy={copy}
          request={{ query: "няма", type: "all", kind: "all" }}
          items={[]}
          contextItems={[]}
          state={state}
        />,
      );

    expect(render("loading")).toContain(copy.loadingLabel);
    expect(render("error")).toContain(copy.errorTitle);
    expect(render("empty")).toContain(copy.emptyTitle);
    // The two empties are told apart, and only one carries a picture — this
    // is the filtered one, so it carries none (DESIGN.md §5.4).
    expect(render("empty")).toContain('data-screen-state="empty-no-results"');
    expect(render("empty")).not.toContain("/illustrations/");
    expect(render("error")).toContain('data-screen-state="error"');
  });
});
