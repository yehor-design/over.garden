import { describe, expect, it } from "vitest";

import {
  JOURNAL_DOCUMENT_SCHEMA_VERSION,
  MAX_JOURNAL_INLINE_IMAGES,
  assertMeaningfulJournalDocument,
  blockCountBucket,
  compareMeaningfulBlockIds,
  extractJournalDocumentPlainText,
  journalDocumentHasFormatting,
  journalDocumentImageCount,
  legacyBodyToJournalDocumentV1,
  normalizeJournalDocument,
  normalizeSafeHref,
  photoCountBucket,
  semanticJournalDocumentHash,
  type JournalDocumentNormalizeResult,
  type JournalDocumentV1,
} from "./journal-document";

function failCode(result: JournalDocumentNormalizeResult) {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected failure");
  return result.code;
}

const MEDIA_IDS = Array.from(
  { length: 10 },
  (_, index) =>
    `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);

function paragraphDoc(text: string, id = "p1"): JournalDocumentV1 {
  return {
    schemaVersion: JOURNAL_DOCUMENT_SCHEMA_VERSION,
    blocks: [{ id, type: "paragraph", spans: [{ text }] }],
  };
}

describe("JournalDocumentV1 normalize", () => {
  it("accepts a full allowlisted document and is idempotent", () => {
    const input: JournalDocumentV1 = {
      schemaVersion: 1,
      blocks: [
        {
          id: "h2",
          type: "heading",
          level: 2,
          spans: [{ text: "Догляд", marks: [{ type: "bold" }] }],
        },
        {
          id: "p1",
          type: "paragraph",
          spans: [
            { text: "Полив " },
            {
              text: "сьогодні",
              marks: [
                { type: "italic" },
                { type: "link", href: "https://example.com/care" },
              ],
            },
          ],
        },
        {
          id: "list1",
          type: "list",
          style: "unordered",
          items: [
            {
              spans: [{ text: "ранок" }],
              items: [{ spans: [{ text: "краплі" }] }],
            },
          ],
        },
        {
          id: "q1",
          type: "quote",
          spans: [{ text: "Тримайся" }],
          attributionSpans: [{ text: "сусід" }],
        },
        { id: "d1", type: "delimiter" },
        { id: "img1", type: "image", mediaAssetId: MEDIA_IDS[0]! },
      ],
    };

    const first = normalizeJournalDocument(input);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = normalizeJournalDocument(first.document);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.document).toEqual(first.document);
    expect(semanticJournalDocumentHash(first.document)).toBe(
      semanticJournalDocumentHash(second.document),
    );
  });

  it("rejects unknown fields, bad versions, and unsafe links", () => {
    expect(
      failCode(
        normalizeJournalDocument({
          schemaVersion: 1,
          blocks: [],
          extra: true,
        }),
      ),
    ).toBe("unknown_field");

    expect(
      failCode(
        normalizeJournalDocument({
          schemaVersion: 99,
          blocks: [],
        }),
      ),
    ).toBe("unsupported_version");

    expect(
      failCode(
        normalizeJournalDocument({
          schemaVersion: 1,
          blocks: [
            {
              id: "p1",
              type: "paragraph",
              spans: [
                {
                  text: "x",
                  marks: [{ type: "link", href: "javascript:alert(1)" }],
                },
              ],
            },
          ],
        }),
      ),
    ).toBe("unsafe_link");
  });

  it("enforces ten inline images and unique media ids", () => {
    const ten: JournalDocumentV1 = {
      schemaVersion: 1,
      blocks: MEDIA_IDS.map((mediaAssetId, index) => ({
        id: `img-${index + 1}`,
        type: "image",
        mediaAssetId,
      })),
    };
    const ok = normalizeJournalDocument(ten);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(journalDocumentImageCount(ok.document)).toBe(
        MAX_JOURNAL_INLINE_IMAGES,
      );
    }

    const eleven = {
      schemaVersion: 1,
      blocks: [
        ...ten.blocks,
        {
          id: "img-11",
          type: "image",
          mediaAssetId: "00000000-0000-4000-8000-000000000099",
        },
      ],
    };
    expect(failCode(normalizeJournalDocument(eleven))).toBe("too_many_images");

    expect(
      failCode(
        normalizeJournalDocument({
          schemaVersion: 1,
          blocks: [
            { id: "a", type: "image", mediaAssetId: MEDIA_IDS[0]! },
            { id: "b", type: "image", mediaAssetId: MEDIA_IDS[0]! },
          ],
        }),
      ),
    ).toBe("duplicate_media");
  });
});

describe("legacy body adapter", () => {
  it("maps plain text paragraphs without character loss", () => {
    const body = "Перший абзац.\n\nДругий абзац з кирилицею.";
    const document = legacyBodyToJournalDocumentV1(body);
    expect(extractJournalDocumentPlainText(document)).toBe(body);
    expect(document.blocks).toHaveLength(2);
  });
});

describe("document identity checks", () => {
  it("detects silent block omission", () => {
    const serialized = paragraphDoc("kept", "keep");
    expect(compareMeaningfulBlockIds(["keep", "missing"], serialized)).toEqual({
      ok: false,
      missingIds: ["missing"],
    });
  });
});

describe("plain text, meaning, and buckets", () => {
  it("requires meaningful text or captioned image", () => {
    expect(() => assertMeaningfulJournalDocument(paragraphDoc("   "))).toThrow(
      /meaningful/i,
    );

    const withImage: JournalDocumentV1 = {
      schemaVersion: 1,
      blocks: [{ id: "img1", type: "image", mediaAssetId: MEDIA_IDS[0]! }],
    };
    expect(() => assertMeaningfulJournalDocument(withImage)).not.toThrow();

    const captions = new Map([[MEDIA_IDS[0]!, ""]]);
    expect(
      normalizeJournalDocument(withImage).ok &&
        extractJournalDocumentPlainText(withImage, {
          imageCaptionByMediaId: captions,
        }),
    ).toBe("");
  });

  it("exposes formatting and count buckets without exact photo counts in analytics helpers", () => {
    const document: JournalDocumentV1 = {
      schemaVersion: 1,
      blocks: [
        {
          id: "p1",
          type: "paragraph",
          spans: [{ text: "a", marks: [{ type: "bold" }] }],
        },
        { id: "img1", type: "image", mediaAssetId: MEDIA_IDS[0]! },
        { id: "img2", type: "image", mediaAssetId: MEDIA_IDS[1]! },
      ],
    };
    expect(journalDocumentHasFormatting(document)).toBe(true);
    expect(photoCountBucket(0)).toBe("none");
    expect(photoCountBucket(1)).toBe("one");
    expect(photoCountBucket(3)).toBe("two_to_three");
    expect(photoCountBucket(6)).toBe("four_to_six");
    expect(photoCountBucket(10)).toBe("seven_to_ten");
    expect(blockCountBucket(1)).toBe("one");
    expect(blockCountBucket(4)).toBe("two_to_five");
  });
});

describe("safe href", () => {
  it("allows http(s) and internal paths only", () => {
    expect(normalizeSafeHref("https://example.com/a")).toBe(
      "https://example.com/a",
    );
    expect(normalizeSafeHref("/garden/objects/1")).toBe("/garden/objects/1");
    expect(() => normalizeSafeHref("data:text/html")).toThrow();
    expect(() => normalizeSafeHref("//evil.example")).toThrow();
  });
});
