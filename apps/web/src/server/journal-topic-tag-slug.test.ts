import { describe, expect, it } from "vitest";

import {
  isAddressSlug,
  isHistoricalAddressSlug,
} from "@/lib/address/address-contract.generated";
import { publicTopicPath } from "@/lib/garden/public-paths";

import { explicitTagTopicDefinition } from "./journal-topic-repository";

/**
 * A gardener's tag becomes the address, in Latin letters (ADR-0029 D4,
 * amendment of 2026-09-18). It kept its Cyrillic between OVE-426 and OVE-465,
 * and a browser hands the clipboard six characters for every Cyrillic letter.
 */
describe("a gardener's tag becomes a Latin address", () => {
  it.each([
    ["помідори", "uk", "pomidory"],
    ["розсада у лютому", "uk", "rozsada-u-liutomu"],
    ["Помідори", "uk", "pomidory"],
    // One word stays one word: the apostrophe is dropped, not split on.
    ["зав'язування", "uk", "zaviazuvannia"],
    ["календарної пастки", "uk", "kalendarnoi-pastky"],
    ["щавель", "uk", "shchavel"],
    ["домати", "bg", "domati"],
    ["щавел", "bg", "shtavel"],
    ["наблюдение и действие", "ru", "nablyudenie-i-deystvie"],
    ["ёлка", "ru", "yolka"],
    ["Cover crops", "uk", "cover-crops"],
    ["  spacing   out  ", "bg", "spacing-out"],
  ] as const)("turns %s, written in %s, into %s", (label, language, slug) => {
    expect(explicitTagTopicDefinition(label, language).slug).toBe(slug);
    expect(isAddressSlug("topic", slug)).toBe(true);
    // Nothing in it to encode: what a reader copies is what they send.
    expect(publicTopicPath(slug)).toBe(`/topics/${slug}`);
  });

  /**
   * The reason the language is an argument and not a constant. This function
   * hard-coded `uk`, which was invisible while the output was Cyrillic. In
   * Latin the two tables disagree about the same letters, and a Bulgarian
   * gardener's tag read through the Ukrainian one is nobody's spelling.
   */
  it("romanizes by the language the entry was written in, not by a constant", () => {
    expect(explicitTagTopicDefinition("домати", "bg").slug).toBe("domati");
    expect(explicitTagTopicDefinition("домати", "uk").slug).toBe("domaty");
    expect(explicitTagTopicDefinition("рози", "uk").slug).toBe("rozy");
    expect(explicitTagTopicDefinition("рози", "bg").slug).toBe("rozi");
  });

  /**
   * And the reason that is safe. The same word from two languages spells two
   * slugs, so a tag looked up by slug alone would found a second topic beside
   * the first with the same word over it. A gardener's tag asks to be joined
   * to the topic that already carries its label.
   */
  it("asks to join the topic that already carries its label", () => {
    expect(explicitTagTopicDefinition("рози", "bg")).toMatchObject({
      label: "рози",
      trustState: "provisional",
      joinByLabel: true,
    });
  });

  it("never answers with a hash for a word written in Cyrillic", () => {
    // The first defect here: `/[^\w -]+/g` without the `u` flag deleted every
    // Cyrillic letter, and `помідори` became `tag-81e9f6d3034d`.
    const definition = explicitTagTopicDefinition("помідори", "uk");
    expect(definition.slug).not.toMatch(/^tag-[0-9a-f]{12}$/u);
    expect(definition.slug).toBe("pomidory");
  });

  it("keeps the label exactly as the gardener wrote it", () => {
    expect(explicitTagTopicDefinition("Розсада У Лютому", "uk").label).toBe(
      "Розсада У Лютому",
    );
  });

  it("falls back to a stable hash only when nothing survives", () => {
    const emoji = explicitTagTopicDefinition("🍅🍅", "uk");
    expect(emoji.slug).toMatch(/^tag-[0-9a-f]{12}$/u);
    expect(explicitTagTopicDefinition("🍅🍅", "bg").slug).toBe(emoji.slug);
    expect(isAddressSlug("topic", emoji.slug)).toBe(true);

    const japanese = explicitTagTopicDefinition("日本語", "uk");
    expect(japanese.slug).toMatch(/^tag-[0-9a-f]{12}$/u);
    expect(japanese.slug).not.toBe(emoji.slug);
  });

  it("stays inside the budget, cut at a whole word", () => {
    const long = explicitTagTopicDefinition(
      "дуже довгий тег про полив томатів у серпні та вересні на грядці",
      "uk",
    );
    expect(long.slug).toBe(
      "duzhe-dovhyi-teh-pro-polyv-tomativ-u-serpni-ta-veresni-na",
    );
    expect(long.slug.length).toBeLessThanOrEqual(60);
    expect(isAddressSlug("topic", long.slug)).toBe(true);
    expect(long.slug.endsWith("-")).toBe(false);
  });

  /**
   * What a tag *used* to be is still an address — it answers 308 — and is no
   * longer something the namespace issues.
   */
  it("still recognizes the Cyrillic name a topic was issued before", () => {
    expect(isAddressSlug("topic", "помідори")).toBe(false);
    expect(isHistoricalAddressSlug("topic", "помідори")).toBe(true);
    expect(isHistoricalAddressSlug("topic", "pomidory")).toBe(true);
    expect(isHistoricalAddressSlug("topic", "Помідори")).toBe(false);
    expect(isHistoricalAddressSlug("topic", "помідори/плюс")).toBe(false);
    // A community never issued anything but ASCII, so it has no older form.
    expect(isHistoricalAddressSlug("community", "спільнота")).toBe(false);
    expect(isHistoricalAddressSlug("community", "observation-and-care")).toBe(
      true,
    );
  });
});
