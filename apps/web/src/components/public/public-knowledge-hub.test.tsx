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
    subject: "product",
    sourceCount: 0,
    updatedDate: "2026-07-10",
    searchText: "",
  },
  {
    kind: "answer",
    path: "/answers/visual-long-recovery-answer",
    title: "Що перевірити після стресу?",
    description: "Коротка відповідь із джерелами.",
    objectKinds: ["plant", "animal"],
    subject: "gardening",
    sourceCount: 4,
    updatedDate: "2026-07-09",
    searchText: "",
  },
  {
    kind: "topic",
    path: "/topics/care-checks",
    title: "Регулярні спостереження",
    description: "",
    objectKinds: ["plant", "animal"],
    entryCount: 11,
    latestPublishedAt: "2026-07-10T10:00:00.000Z",
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
    // A row says what it is about and what it rests on (`OVE-498`,
    // OG-UX-033): advice with its sources, help with OverGarden as help, a
    // topic with its real count and recency — and nothing about indexing
    // (OG-UX-032).
    expect(html).toContain("Садівництво · Відповідь");
    expect(html).toContain("4 джерела");
    expect(html).toContain("Довідка OverGarden · Посібник");
    expect(html).toContain("Записи садівників");
    expect(html).toContain("11 записів садівників");
    expect(html).toContain("останній запис");
    expect(html).not.toMatch(/індексац/u);
    expect(html).toContain("/guides/visual-seasonal-observation");
    expect(html).toContain("/topics/care-checks");
    // Answers first, then topics, then help with OverGarden.
    expect(html.indexOf('id="knowledge-answer"')).toBeLessThan(
      html.indexOf('id="knowledge-topic"'),
    );
    expect(html.indexOf('id="knowledge-topic"')).toBeLessThan(
      html.indexOf('id="knowledge-guide"'),
    );
    // One list of results, not the same list again in a rail and again
    // under it (criterion 4).
    expect(html).not.toContain('data-site-shell-context="route-owned"');
    expect(html.match(/\/topics\/care-checks/gu)?.length).toBe(1);
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

  it("keeps the answers and guides when only the topics could not be read", () => {
    const copy = getPublicKnowledgeCopy("ru");
    const html = renderToStaticMarkup(
      <PublicKnowledgeHub
        locale="ru"
        copy={copy}
        request={{ query: "", type: "all", kind: "plant" }}
        items={items.filter((item) => item.kind !== "topic")}
        state="ready"
        topicsUnavailable
      />,
    );

    expect(html).toContain("/answers/visual-long-recovery-answer");
    expect(html).toContain('data-knowledge-topics-unavailable="true"');
    expect(html).toContain(copy.topicsUnavailableTitle);
    // Retried as the same view, by a document request.
    expect(html).toMatch(
      /<a href="\/ru\/knowledge\?kind=plant"[^>]*>Повторить<\/a>/u,
    );
    expect(html).not.toContain('data-screen-state="error"');
  });
});
