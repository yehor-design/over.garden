import { describe, expect, it } from "vitest";

import {
  SYSTEM_TOPIC_SLUGS,
  isSystemTopicSlug,
  localizeTopicLabel,
  systemTopicPrimaryLabel,
} from "./system-topic-labels";

describe("system topic labels", () => {
  it("names a system topic in the page's language and keeps its slug", () => {
    expect(localizeTopicLabel("uk", "plants", "Plants")).toBe("Рослини");
    expect(localizeTopicLabel("bg", "plants", "Plants")).toBe("Растения");
    expect(localizeTopicLabel("ru", "observation-and-care", "x")).toBe(
      "Наблюдения и уход",
    );
  });

  // A gardener's tag is the gardener's word: no map entry, no translation.
  it("leaves a gardener's own tag exactly as stored", () => {
    expect(localizeTopicLabel("bg", "мій-перший-помідор", "Мій перший помідор")).toBe(
      "Мій перший помідор",
    );
    expect(isSystemTopicSlug("мій-перший-помідор")).toBe(false);
  });

  it("has a primary label for every system slug, in every locale", () => {
    for (const slug of SYSTEM_TOPIC_SLUGS) {
      expect(systemTopicPrimaryLabel(slug)).toBeTruthy();
      for (const locale of ["uk", "bg", "ru"] as const) {
        expect(localizeTopicLabel(locale, slug, "")).not.toBe("");
      }
    }
  });
});
