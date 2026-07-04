import { describe, expect, it } from "vitest";

import {
  MAX_JOURNAL_TOPIC_TAGS,
  normalizeJournalTopicTagLabel,
  normalizeJournalTopicTagLabels,
} from "./journal-topics";

describe("journal topic tag normalization", () => {
  it("keeps a bounded deduped list of understandable user tags", () => {
    expect(
      normalizeJournalTopicTagLabels([
        " watering ",
        "#seedlings",
        "watering",
        "pests",
        "soil care",
        "harvest",
        "flowering",
        "ignored because over limit",
      ]),
    ).toEqual(["watering", "seedlings", "pests", "soil care", "harvest"]);
  });

  it("rejects obvious contact, precise location, URL, and private markers", () => {
    const unsafe = [
      "me@example.com",
      "https://example.com",
      "+380 67 123 45 67",
      "50.450100, 30.523400",
      "media key",
      "user agent",
      "ip address",
      "token",
    ];

    for (const value of unsafe) {
      expect(normalizeJournalTopicTagLabel(value)).toBeNull();
    }
  });

  it("caps the number and length of stored explicit tags", () => {
    expect(
      normalizeJournalTopicTagLabels(
        Array.from({ length: MAX_JOURNAL_TOPIC_TAGS + 2 }, (_, index) =>
          `tag ${index}`,
        ),
      ),
    ).toHaveLength(MAX_JOURNAL_TOPIC_TAGS);
    expect(normalizeJournalTopicTagLabel("a".repeat(41))).toBeNull();
  });
});
