import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { getPublicKnowledgeCopy } from "@/lib/public-knowledge-copy";
import type { PublicKnowledgeEvidence } from "@/server/public-knowledge-evidence-repository";
import { PublicKnowledgeEvidenceList } from "./public-knowledge-evidence";

describe("PublicKnowledgeEvidenceList", () => {
  it("keeps user evidence distinct and links to the journal, object, and explainable match", () => {
    const html = renderToStaticMarkup(
      <PublicKnowledgeEvidenceList
        locale="ru"
        copy={getPublicKnowledgeCopy("ru")}
        evidence={evidence()}
        state="ready"
      />,
    );

    expect(html).toContain('data-trust-state="user-evidence"');
    expect(html).toContain("Опыт из публичных журналов");
    expect(html).toContain("Почему это связано");
    expect(html).toContain("Общая тема");
    expect(html).toContain("Проблеми та відновлення");
    expect(html).toContain('href="/ru/topics/stress-and-recovery"');
    expect(html).toContain('href="/variety/visual-pomidor-cheri"');
    expect(html).toContain("/journal/recovery-note");
    expect(html).toContain(
      "/lineage/objects/00000000-0000-4000-8000-000000000101",
    );
    expect(html).toContain("/journals?topic=stress-and-recovery");
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
      />,
    );

    expect(html).toContain(copy.emptyEvidenceTitle);
    expect(html).toContain(copy.emptyEvidenceBody);
    expect(html).not.toContain("Читати запис");
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
