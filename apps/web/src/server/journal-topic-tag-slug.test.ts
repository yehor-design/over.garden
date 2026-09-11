import { describe, expect, it } from "vitest";

import { isAddressSlug } from "@/lib/address/address-contract.generated";
import { publicTopicPath } from "@/lib/garden/public-paths";

import { explicitTagTopicDefinition } from "./journal-topic-repository";

describe("a gardener's tag becomes the address (ADR-0029 D4)", () => {
  it.each([
    ["помідори", "помідори"],
    ["розсада у лютому", "розсада-у-лютому"],
    ["Помідори", "помідори"],
    ["зав'язування", "завязування"],
    ["календарної пастки", "календарної-пастки"],
    ["домати", "домати"],
    ["наблюдение и действие", "наблюдение-и-действие"],
    ["ёлка", "ёлка"],
    ["Cover crops", "cover-crops"],
    ["  spacing   out  ", "spacing-out"],
  ])("turns %s into %s", (label, slug) => {
    expect(explicitTagTopicDefinition(label).slug).toBe(slug);
    expect(isAddressSlug("topic", slug)).toBe(true);
  });

  /**
   * The whole defect in one assertion. The old filter was `/[^\w -]+/g`, and
   * `\w` without the `u` flag is `[A-Za-z0-9_]`, so every Cyrillic letter was
   * deleted and the fallback hash took over.
   */
  it("no longer answers with a hash for a word written in Cyrillic", () => {
    const definition = explicitTagTopicDefinition("помідори");
    expect(definition.slug).not.toMatch(/^tag-[0-9a-f]{12}$/u);
    expect(publicTopicPath(definition.slug)).toBe(
      `/topics/${encodeURIComponent("помідори")}`,
    );
  });

  it("keeps the label exactly as the gardener wrote it", () => {
    expect(explicitTagTopicDefinition("Розсада У Лютому").label).toBe(
      "Розсада У Лютому",
    );
    expect(explicitTagTopicDefinition("помідори").trustState).toBe(
      "provisional",
    );
  });

  it("falls back to a stable hash only when nothing survives", () => {
    const emoji = explicitTagTopicDefinition("🍅🍅");
    expect(emoji.slug).toMatch(/^tag-[0-9a-f]{12}$/u);
    expect(explicitTagTopicDefinition("🍅🍅").slug).toBe(emoji.slug);
    expect(isAddressSlug("topic", emoji.slug)).toBe(true);

    const japanese = explicitTagTopicDefinition("日本語");
    expect(japanese.slug).toMatch(/^tag-[0-9a-f]{12}$/u);
    expect(japanese.slug).not.toBe(emoji.slug);
  });

  it("produces a slug the widened CHECK admits, at the budget", () => {
    const long = explicitTagTopicDefinition(
      "дуже довгий тег про полив томатів у серпні та вересні на грядці",
    );
    expect(isAddressSlug("topic", long.slug)).toBe(true);
    expect(encodeURIComponent(long.slug).length).toBeLessThanOrEqual(180);
    expect(long.slug.endsWith("-")).toBe(false);
  });
});
