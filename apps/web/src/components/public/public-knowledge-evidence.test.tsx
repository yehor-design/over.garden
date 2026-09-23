import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { getPublicKnowledgeCopy } from "@/lib/public-knowledge-copy";
import type { PublicKnowledgeEvidence } from "@/server/public-knowledge-evidence-repository";
import { PublicKnowledgeEvidenceList } from "./public-knowledge-evidence";

describe("PublicKnowledgeEvidenceList", () => {
  it("keeps user evidence distinct and links to the journal, object, and explainable match", () => {
    const copy = getPublicKnowledgeCopy("ru");
    const html = renderToStaticMarkup(
      <PublicKnowledgeEvidenceList
        locale="ru"
        copy={copy}
        evidence={evidence()}
        state="ready"
        title="Что садоводы записали о томатах"
        note={copy.evidenceNote}
        headingId="answer-evidence"
        retryHref="/ru/answers/why-are-tomato-leaves-yellow"
      />,
    );

    expect(html).toContain('data-trust-state="user-evidence"');
    // The heading says whose entries and about what; the count is the
    // sentence beneath it, with what the entries are not (`OVE-498`).
    expect(html).toMatch(
      /<h2 id="answer-evidence"[^>]*>Что садоводы записали о томатах<\/h2>/u,
    );
    expect(html).toContain(
      "4 записи садоводов. Это собственные наблюдения садоводов: они не подтверждают и не опровергают текст выше.",
    );
    // Into the journals' query view: a plain link, never the client router.
    expect(html).toMatch(
      /<a href="\/journals\?topic=stress-and-recovery" data-knowledge-evidence-all="true"[^>]*>Все записи \(4\)/u,
    );
    // Each entry is a heading under the section, for heading navigation.
    expect(html).toMatch(/<h3[^>]*><a[^>]*href="\/journal\/recovery-note"/u);
    expect(html).toContain("Почему это связано");
    expect(html).toContain("Общая тема");
    expect(html).toContain("Проблеми та відновлення");
    expect(html).toContain('href="/ru/topics/stress-and-recovery"');
    expect(html).toContain('href="/variety/visual-pomidor-cheri"');
    expect(html).toContain("/journal/recovery-note");
    expect(html).toContain(
      "/lineage/objects/00000000-0000-4000-8000-000000000101",
    );
    expect(html).toContain('loading="eager"');
    expect(html).not.toContain("ownerUserId");
    expect(html).not.toContain("/garden");
  });

  it("states missing evidence honestly instead of fabricating examples", () => {
    const copy = getPublicKnowledgeCopy("uk");
    const html = renderToStaticMarkup(
      <PublicKnowledgeEvidenceList
        locale="uk"
        copy={copy}
        evidence={{
          items: [],
          totalCount: 0,
          hasMore: false,
          allEvidencePath: "/journals",
        }}
        state="empty"
        title="Що садівники записали про томати"
        retryHref="/answers/why-are-tomato-leaves-yellow"
      />,
    );

    expect(html).toContain(copy.emptyEvidenceTitle);
    expect(html).toContain("Ми не підставляємо вигаданих прикладів.");
    expect(html).not.toContain("Читати запис");
    // No count and no "all entries" over nothing (DESIGN.md §5.10).
    expect(html).not.toContain("data-knowledge-evidence-count");
    expect(html).not.toContain("data-knowledge-evidence-all");
  });

  it("retries a failed read on the page the reader is on", () => {
    const copy = getPublicKnowledgeCopy("bg");
    const html = renderToStaticMarkup(
      <PublicKnowledgeEvidenceList
        locale="bg"
        copy={copy}
        evidence={{
          items: [],
          totalCount: 0,
          hasMore: false,
          allEvidencePath: "/bg/journals",
        }}
        state="error"
        title="Записи на градинари"
        retryHref="/bg/topics/plants"
      />,
    );

    expect(html).toContain('data-knowledge-evidence="error"');
    expect(html).toContain(copy.errorTitle);
    // The same page, as a document — not the knowledge hub.
    expect(html).toMatch(
      /<a href="\/bg\/topics\/plants"[^>]*>Опитайте отново<\/a>/u,
    );
    expect(html).not.toContain('href="/bg/knowledge"');
  });
});

function evidence(): PublicKnowledgeEvidence {
  return {
    totalCount: 4,
    hasMore: true,
    allEvidencePath: "/journals?topic=stress-and-recovery",
    items: [
      {
        matches: [
          {
            kind: "topic",
            slug: "stress-and-recovery",
            label: "Проблеми та відновлення",
            publicPath: "/ru/topics/stress-and-recovery",
          },
          {
            kind: "catalog",
            slug: "visual-pomidor-cheri",
            label: "Помідор чері",
            publicPath: "/variety/visual-pomidor-cheri",
          },
        ],
        card: {
          title: "Відновлення після зміни режиму",
          excerpt: "Стан стабілізувався після одного контрольованого кроку.",
          sourceLanguage: "uk",
          entryDate: "2026-07-10",
          publishedAt: "2026-07-10T12:00:00.000Z",
          publicPath: "/journal/recovery-note",
          season: "summer",
          safeRegionCode: null,
          object: {
            displayName: "Черрі біля стінки",
            kind: "plant",
            identityLabel: "Помідор чері",
            catalogKind: "plant_variety",
            catalogSlug: "visual-pomidor-cheri",
            catalogPath: "/variety/visual-pomidor-cheri",
            publicPath: "/lineage/objects/00000000-0000-4000-8000-000000000101",
          },
          author: null,
          media: [
            {
              publicUrl: "/fixture-media/recovery.png",
              focalX: 0.5,
              focalY: 0.5,
              intrinsicWidth: 800,
              intrinsicHeight: 600,
              placeholderDataUri: null,
              variantLongEdges: [],
            },
          ],
          topics: [
            { slug: "stress-and-recovery", label: "Проблеми та відновлення" },
          ],
        },
      },
    ],
  };
}
