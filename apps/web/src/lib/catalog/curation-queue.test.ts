import { describe, expect, it } from "vitest";

import {
  automaticOutcomeFromRecord,
  CATALOG_SOURCES_OUTCOME_ANCHOR,
  CATALOG_SOURCES_PATH,
  CATALOG_SOURCES_RESULTS,
  CURATION_ITEM_TYPES,
  CURATION_OUTCOME_ANCHOR,
  CURATION_QUEUE_PATH,
  CURATION_RESULTS,
  catalogSourceAnchor,
  catalogSourcesHref,
  curationItemName,
  curationQueueHref,
  queueOutcomeFromRecord,
  quoteCurationText,
  readCatalogSourceSlug,
  readCatalogSourcesOutcome,
  readCurationItemType,
  readCurationOutcome,
  readCurationUuid,
  type CurationResult,
} from "./curation-queue";

const ITEM = "11111111-1111-4111-8111-111111111111";
const NEXT = "44444444-4444-4444-8444-444444444444";
const ACTION = "55555555-5555-4555-8555-555555555555";

describe("the queue's addresses (OVE-506)", () => {
  it("spells the bare queue and every part of a view in one fixed order", () => {
    expect(curationQueueHref({})).toBe(CURATION_QUEUE_PATH);
    expect(CURATION_QUEUE_PATH).toBe("/garden/catalog/queue");
    expect(
      curationQueueHref({
        type: "node_merge",
        item: ITEM,
        confirm: true,
        result: "accepted",
        decided: NEXT,
        action: ACTION,
        hash: CURATION_OUTCOME_ANCHOR,
      }),
    ).toBe(
      `/garden/catalog/queue?type=node_merge&item=${ITEM}&confirm=merge&result=accepted&decided=${NEXT}&action=${ACTION}#queue-outcome`,
    );
  });

  it("drops what a view does not have, so no empty parameter reaches the page", () => {
    expect(
      curationQueueHref({
        type: null,
        item: null,
        confirm: false,
        decided: null,
        action: null,
      }),
    ).toBe("/garden/catalog/queue");
    expect(curationQueueHref({ item: ITEM, hash: "decision" })).toBe(
      `/garden/catalog/queue?item=${ITEM}#decision`,
    );
    // The grant is the one word `merge`, never the item's own id or a flag.
    expect(curationQueueHref({ item: ITEM, confirm: true })).toBe(
      `/garden/catalog/queue?item=${ITEM}&confirm=merge`,
    );
  });

  it("spells the sources page, its answers and a source's row", () => {
    expect(catalogSourcesHref({})).toBe(CATALOG_SOURCES_PATH);
    expect(CATALOG_SOURCES_PATH).toBe("/garden/catalog/sources");
    expect(
      catalogSourcesHref({
        result: "queued",
        source: "eppo",
        hash: CATALOG_SOURCES_OUTCOME_ANCHOR,
      }),
    ).toBe("/garden/catalog/sources?result=queued&source=eppo#sources-outcome");
    expect(
      catalogSourcesHref({
        result: "miss-queued",
        source: null,
        queueItem: ITEM,
        hash: "misses-outcome",
      }),
    ).toBe(
      `/garden/catalog/sources?result=miss-queued&queueItem=${ITEM}#misses-outcome`,
    );
    expect(catalogSourceAnchor("world-flora-online")).toBe(
      "source-world-flora-online",
    );
  });
});

describe("reading an address back (OVE-506)", () => {
  it("reads a queue item id the way the database spells it", () => {
    expect(readCurationUuid(ITEM)).toBe(ITEM);
    expect(readCurationUuid(`  ${ITEM.toUpperCase()}  `)).toBe(ITEM);
    // A repeated parameter answers with its first value.
    expect(readCurationUuid([NEXT, ITEM])).toBe(NEXT);
  });

  it.each([
    ["an empty string", ""],
    ["no value", undefined],
    ["a null form field", null],
    ["a word", "report-1"],
    ["a uuid with a tail", `${ITEM}x`],
    ["a uuid missing a group", "11111111-1111-4111-111111111111"],
    ["an injection attempt", `${ITEM}' or '1'='1`],
    ["an empty repeated parameter", []],
  ])("refuses %s as an item id", (_label, value) => {
    expect(readCurationUuid(value)).toBeNull();
  });

  it("refuses an uploaded file where an item id belongs", () => {
    expect(readCurationUuid(new File([ITEM], "item.txt"))).toBeNull();
  });

  it("reads every decidable item type and nothing else", () => {
    for (const type of CURATION_ITEM_TYPES) {
      expect(readCurationItemType(type)).toBe(type);
      expect(readCurationItemType(` ${type} `)).toBe(type);
    }
    expect(readCurationItemType(["split_review", "node_merge"])).toBe(
      "split_review",
    );
    // Coverage is not a decision, so it is not a view of the queue either.
    for (const junk of [
      "source_unmatched",
      "LABEL_LINK",
      "label-link",
      "",
      null,
    ]) {
      expect(readCurationItemType(junk)).toBeNull();
    }
  });

  it("reads a source slug under the same rule the snapshots table checks", () => {
    expect(readCatalogSourceSlug("eppo")).toBe("eppo");
    expect(readCatalogSourceSlug("world-flora-online")).toBe(
      "world-flora-online",
    );
    expect(readCatalogSourceSlug(["gbif-backbone"])).toBe("gbif-backbone");
    expect(readCatalogSourceSlug("a".repeat(80))).toBe("a".repeat(80));

    for (const junk of [
      "",
      "EPPO",
      "EPPO Global",
      "eppo_codes",
      "-eppo",
      "eppo-",
      "eppo--codes",
      "../etc",
      "eppo;drop",
      "a".repeat(81),
      null,
      undefined,
    ]) {
      expect(readCatalogSourceSlug(junk), String(junk)).toBeNull();
    }
  });

  it("reads each of the queue's answers, and no other word", () => {
    for (const result of CURATION_RESULTS) {
      expect(readCurationOutcome({ result })).toEqual({
        result,
        decided: null,
        action: null,
      });
    }
    expect(
      readCurationOutcome({
        result: "accepted",
        decided: ITEM.toUpperCase(),
        action: ACTION,
      }),
    ).toEqual({ result: "accepted", decided: ITEM, action: ACTION });

    expect(readCurationOutcome({})).toBeNull();
    expect(readCurationOutcome({ result: "done", decided: ITEM })).toBeNull();
    expect(readCurationOutcome({ result: "Accepted" })).toBeNull();
    // An outcome whose item cannot be read names nothing, rather than a guess.
    expect(
      readCurationOutcome({
        result: "rejected",
        decided: "item-1",
        action: "x",
      }),
    ).toEqual({ result: "rejected", decided: null, action: null });
  });

  it("reads each of the sources page's answers, and no other word", () => {
    for (const result of CATALOG_SOURCES_RESULTS) {
      expect(readCatalogSourcesOutcome({ result })).toEqual({
        result,
        source: null,
        queueItem: null,
      });
    }
    expect(
      readCatalogSourcesOutcome({
        result: "queued",
        source: "eppo",
        queueItem: ITEM,
      }),
    ).toEqual({ result: "queued", source: "eppo", queueItem: ITEM });

    expect(readCatalogSourcesOutcome({})).toBeNull();
    expect(readCatalogSourcesOutcome({ result: "refreshed" })).toBeNull();
    expect(
      readCatalogSourcesOutcome({
        result: "failed",
        source: "EPPO Global",
        queueItem: "item-1",
      }),
    ).toEqual({ result: "failed", source: null, queueItem: null });
  });
});

describe("what a decision is called (OVE-506)", () => {
  it("quotes a gardener's words the way each language does", () => {
    expect(quoteCurationText("uk", "Де Барао")).toBe("«Де Барао»");
    expect(quoteCurationText("ru", "Де Барао")).toBe("«Де Барао»");
    expect(quoteCurationText("bg", "Де Барао")).toBe("„Де Барао“");
  });

  it("names a label and the card it would join", () => {
    expect(
      curationItemName("uk", {
        itemType: "label_link",
        subjectLabel: "Де Барао",
        subjectName: "Solanum lycopersicum",
        targetName: "Solanum lycopersicum 'De Barao'",
      }),
    ).toBe("«Де Барао» → Solanum lycopersicum 'De Barao'");
  });

  it("joins a label to its subject when the item names no target", () => {
    expect(
      curationItemName("bg", {
        itemType: "label_link",
        subjectLabel: "Де Барао",
        subjectName: "Solanum lycopersicum",
        targetName: null,
      }),
    ).toBe("„Де Барао“ → Solanum lycopersicum");
  });

  it("names a label on its own when there is no card to join yet", () => {
    // A search miss the owner queued: a name and no card.
    expect(
      curationItemName("uk", {
        itemType: "label_link",
        subjectLabel: "помідор де барао",
        subjectName: null,
        targetName: null,
      }),
    ).toBe("«помідор де барао»");
  });

  it("names a merge by the two cards it folds together", () => {
    expect(
      curationItemName("ru", {
        itemType: "node_merge",
        subjectLabel: null,
        subjectName: "Lycopersicon esculentum",
        targetName: "Solanum lycopersicum",
      }),
    ).toBe("Lycopersicon esculentum → Solanum lycopersicum");
  });

  it("falls back to whichever side it has, and to a dash when it has none", () => {
    expect(
      curationItemName("uk", {
        itemType: "node_merge",
        subjectLabel: null,
        subjectName: "Lycopersicon esculentum",
        targetName: null,
      }),
    ).toBe("Lycopersicon esculentum");
    expect(
      curationItemName("uk", {
        itemType: "node_merge",
        subjectLabel: null,
        subjectName: null,
        targetName: "Solanum lycopersicum",
      }),
    ).toBe("Solanum lycopersicum");
    expect(
      curationItemName("uk", {
        itemType: "source_link",
        subjectLabel: null,
        subjectName: "Solanum lycopersicum",
        targetName: "Solanum",
      }),
    ).toBe("Solanum lycopersicum");
    // A label on an item that is not a label link is shown, not quoted.
    expect(
      curationItemName("uk", {
        itemType: "split_review",
        subjectLabel: "Де Барао",
        subjectName: null,
        targetName: null,
      }),
    ).toBe("Де Барао");
    // A label link without its label is named by its card.
    expect(
      curationItemName("uk", {
        itemType: "label_link",
        subjectLabel: null,
        subjectName: null,
        targetName: "Solanum lycopersicum",
      }),
    ).toBe("Solanum lycopersicum");
    expect(
      curationItemName("uk", {
        itemType: "label_link",
        subjectLabel: null,
        subjectName: null,
        targetName: null,
      }),
    ).toBe("—");
  });
});

/**
 * Every state `catalog_curation_queue.state` may hold (migration `0054`'s
 * CHECK). A notice is said only where the record bears the answer out.
 */
const QUEUE_STATES = [
  "open",
  "accepted",
  "rejected",
  "skipped",
  "auto_applied",
  "reverted",
] as const;

/** What each answer may say over each state, in `QUEUE_STATES` order. */
const QUEUE_NOTICES: Record<CurationResult, (CurationResult | null)[]> = {
  // Only an item the record holds as accepted — by the owner or the worker.
  accepted: [null, "accepted", null, null, "accepted", null],
  rejected: [null, null, "rejected", null, null, null],
  skipped: [null, null, null, "skipped", null, null],
  // "Nothing changed, try again" over an item that is decided was stale.
  failed: ["failed", "stale", "stale", "stale", "stale", "stale"],
  confirm: ["confirm", "stale", "stale", "stale", "stale", "stale"],
  // "Already decided" over an item that is still open is said not at all.
  stale: [null, "stale", "stale", "stale", "stale", "stale"],
  // A refusal refused; it is said whatever the item is.
  denied: ["denied", "denied", "denied", "denied", "denied", "denied"],
  // An undo is the automatic list's to answer.
  reverted: [null, null, null, null, null, null],
};

/** What each answer to an undo may say: over an action undone, and in force. */
const UNDO_NOTICES: Record<
  CurationResult,
  [CurationResult | null, CurationResult | null]
> = {
  reverted: ["reverted", null],
  // "Nothing changed" over an action that is undone was stale.
  failed: ["stale", "failed"],
  stale: ["stale", null],
  denied: ["denied", "denied"],
  // A decision's word, sent to an undo, says nothing.
  accepted: [null, null],
  rejected: [null, null],
  skipped: [null, null],
  confirm: [null, null],
};

describe("what a notice may say, read back from the record (OVE-506)", () => {
  it("has an answer for every result the queue writes", () => {
    expect(Object.keys(QUEUE_NOTICES).sort()).toEqual(
      [...CURATION_RESULTS].sort(),
    );
  });

  it.each(Object.entries(QUEUE_NOTICES))(
    "a queue item's %s is said only where its state bears it out",
    (result, expected) => {
      QUEUE_STATES.forEach((state, index) => {
        expect(
          queueOutcomeFromRecord(result as CurationResult, state),
          `${result} over ${state}`,
        ).toBe(expected[index]);
      });
    },
  );

  it("says nothing of a decision over a state it does not know", () => {
    expect(queueOutcomeFromRecord("accepted", "archived")).toBeNull();
    expect(queueOutcomeFromRecord("stale", "archived")).toBe("stale");
    expect(queueOutcomeFromRecord("failed", "")).toBe("stale");
  });

  it("has an answer for every result an undo can be sent back with", () => {
    expect(Object.keys(UNDO_NOTICES).sort()).toEqual(
      [...CURATION_RESULTS].sort(),
    );
  });

  it.each(Object.entries(UNDO_NOTICES))(
    "an undo's %s is said only where the action bears it out",
    (result, [overUndone, overInForce]) => {
      expect(
        automaticOutcomeFromRecord(result as CurationResult, true),
        "over an action undone",
      ).toBe(overUndone);
      expect(
        automaticOutcomeFromRecord(result as CurationResult, false),
        "over an action still in force",
      ).toBe(overInForce);
    },
  );
});
