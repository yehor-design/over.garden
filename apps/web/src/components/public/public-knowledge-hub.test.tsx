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
        visualCorpus
      />,
    );

    expect(html).toContain('data-public-knowledge-hub="true"');
    expect(html).toContain('data-public-knowledge-state="ready"');
    expect(html).toContain('aria-label="Фільтри знань"');
    expect(html).toContain('name="q"');
    expect(html).toContain('name="type"');
    expect(html).toContain('name="kind"');
    expect(html).toContain('name="__visualKnowledge" value="corpus"');
    expect(html).toContain("Авторський матеріал");
    expect(html).toContain("Досвід із публічних журналів");
    expect(html).toContain("11 публічних записів");
    expect(html).toContain(
      "/guides/visual-seasonal-observation?__visualKnowledge=corpus",
    );
    expect(html).toContain("/topics/care-checks?__visualKnowledge=corpus");
    expect(html).toContain('data-site-shell-context="route-owned"');
    expect(html).not.toContain("/garden");
    expect(html).not.toContain("rounded-full");
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
  });
});
