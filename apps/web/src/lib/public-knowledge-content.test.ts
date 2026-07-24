import { describe, expect, it } from "vitest";

import {
  buildPublicKnowledgeHref,
  filterPublicKnowledgeItems,
  normalizePublicKnowledgeRequest,
  type PublicKnowledgeListItem,
} from "./public-knowledge-content";
import {
  getLocalizedAnswerPage,
  getLocalizedGuide,
} from "@/server/public-localized-content";

const ITEMS: PublicKnowledgeListItem[] = [
  {
    kind: "guide",
    path: "/guides/start-a-living-plant-record",
    title: "Як почати живий журнал рослини",
    description: "Один об'єкт, одна дата й наступне спостереження.",
    objectKinds: ["plant"],
  },
  {
    kind: "answer",
    path: "/answers/why-are-tomato-leaves-yellow",
    title: "Чому жовтіє листя помідора?",
    description: "Публічна відповідь із перевіркою реальних записів.",
    objectKinds: ["plant"],
  },
  {
    kind: "topic",
    path: "/topics/care-checks",
    title: "Регулярні спостереження",
    description: "Докази з рослин, тварин і бджолосімей.",
    objectKinds: ["plant", "animal"],
  },
];

describe("public knowledge URL and filtering contract", () => {
  it("localizes editorial authorship without pretending UGC was translated", () => {
    expect(
      getLocalizedGuide("bg", "start-a-living-plant-record")?.editorial
        .authoredLocale,
    ).toBe("bg");
    expect(
      getLocalizedAnswerPage("ru", "why-are-tomato-leaves-yellow")?.editorial
        .authoredLocale,
    ).toBe("ru");
  });

  it("normalizes bounded allowlisted query state", () => {
    expect(
      normalizePublicKnowledgeRequest({
        q: `  ${"догляд ".repeat(30)}  `,
        type: "ANSWER",
        kind: "BEE_COLONY",
      }),
    ).toEqual({
      query: "догляд ".repeat(16).trim(),
      type: "answer",
      kind: "animal",
    });

    expect(
      normalizePublicKnowledgeRequest({
        q: "50.12345, 30.12345",
        type: "marketing",
        kind: "person",
      }),
    ).toEqual({ query: "", type: "all", kind: "all" });
  });

  it("builds stable localized hrefs and preserves fixture mode only when requested", () => {
    expect(
      buildPublicKnowledgeHref(
        "bg",
        { query: "полив", type: "topic", kind: "plant" },
        true,
      ),
    ).toBe(
      "/bg/knowledge?q=%D0%BF%D0%BE%D0%BB%D0%B8%D0%B2&type=topic&kind=plant&__visualKnowledge=corpus",
    );
    expect(
      buildPublicKnowledgeHref(
        "uk",
        { query: "", type: "all", kind: "all" },
        false,
      ),
    ).toBe("/knowledge");
  });

  it("filters guides, answers, and topics by explicit type, kind, and text", () => {
    expect(
      filterPublicKnowledgeItems(ITEMS, {
        query: "докази",
        type: "topic",
        kind: "animal",
      }).map((item) => item.path),
    ).toEqual(["/topics/care-checks"]);

    expect(
      filterPublicKnowledgeItems(ITEMS, {
        query: "",
        type: "all",
        kind: "plant",
      }),
    ).toHaveLength(3);
  });
});
