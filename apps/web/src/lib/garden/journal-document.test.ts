import { describe, expect, it } from "vitest";

import {
  DEFAULT_JOURNAL_CALLOUT_ICON,
  DEFAULT_JOURNAL_CODE_LANGUAGE,
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
  journalDocumentHasMeaningfulBody,
  journalMarkRank,
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

  // OVE-432: the caption is additive at schema version 1 (ADR-0028's pattern).
  // A document written before it existed has no key and stays valid.
  it("carries an image caption, and drops it when it says nothing", () => {
    const withCaption = normalizeJournalDocument({
      schemaVersion: 1,
      blocks: [
        {
          id: "img1",
          type: "image",
          mediaAssetId: MEDIA_IDS[0]!,
          caption: "  Перша   китиця\n",
        },
      ],
    });
    expect(withCaption.ok).toBe(true);
    expect(withCaption.ok && withCaption.document.blocks[0]).toEqual({
      id: "img1",
      type: "image",
      mediaAssetId: MEDIA_IDS[0]!,
      caption: "Перша китиця",
    });

    for (const caption of [undefined, null, "", "   "]) {
      const result = normalizeJournalDocument({
        schemaVersion: 1,
        blocks: [
          { id: "img1", type: "image", mediaAssetId: MEDIA_IDS[0]!, caption },
        ],
      });
      expect(result.ok, String(caption)).toBe(true);
      expect(result.ok && result.document.blocks[0]).toEqual({
        id: "img1",
        type: "image",
        mediaAssetId: MEDIA_IDS[0]!,
      });
    }
  });

  it("refuses a caption that is not a line of prose", () => {
    const tooLong = normalizeJournalDocument({
      schemaVersion: 1,
      blocks: [
        {
          id: "img1",
          type: "image",
          mediaAssetId: MEDIA_IDS[0]!,
          caption: "я".repeat(281),
        },
      ],
    });
    expect(failCode(tooLong)).toBe("invalid_block");

    const notAString = normalizeJournalDocument({
      schemaVersion: 1,
      blocks: [
        { id: "img1", type: "image", mediaAssetId: MEDIA_IDS[0]!, caption: 7 },
      ],
    });
    expect(failCode(notAString)).toBe("invalid_block");
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

describe("Notion basic blocks (ADR-0028)", () => {
  const NOTION_DOC = {
    schemaVersion: 1,
    blocks: [
      { id: "h1", type: "heading", level: 1, spans: [{ text: "Сезон" }] },
      {
        id: "todo1",
        type: "list",
        style: "todo",
        items: [
          { spans: [{ text: "полити" }], checked: true },
          {
            spans: [{ text: "підв'язати" }],
            items: [{ spans: [{ text: "томати" }] }],
          },
        ],
      },
      {
        id: "call1",
        type: "callout",
        icon: "🌱",
        spans: [{ text: "Проростає на сьомий день." }],
      },
      {
        id: "code1",
        type: "code",
        language: "sql",
        text: "select 1;\nselect 2;",
      },
      {
        id: "p1",
        type: "paragraph",
        spans: [
          {
            text: "усе разом",
            marks: [
              { type: "strikethrough" },
              { type: "code" },
              { type: "underline" },
              { type: "bold" },
            ],
          },
        ],
      },
    ],
  } as const;

  it("accepts every new block and mark, and is idempotent", () => {
    const first = normalizeJournalDocument(NOTION_DOC);
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

  it("fills the callout icon and the code language when they are omitted", () => {
    const result = normalizeJournalDocument({
      schemaVersion: 1,
      blocks: [
        { id: "c", type: "callout", spans: [{ text: "порада" }] },
        { id: "k", type: "code", text: "x" },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.blocks[0]).toEqual({
      id: "c",
      type: "callout",
      icon: DEFAULT_JOURNAL_CALLOUT_ICON,
      spans: [{ text: "порада" }],
    });
    expect(result.document.blocks[1]).toEqual({
      id: "k",
      type: "code",
      language: DEFAULT_JOURNAL_CODE_LANGUAGE,
      text: "x",
    });
  });

  it("sorts marks into one canonical order so the hash cannot move", () => {
    const shuffled = normalizeJournalDocument({
      schemaVersion: 1,
      blocks: [
        {
          id: "p",
          type: "paragraph",
          spans: [
            {
              text: "x",
              marks: [
                { type: "link", href: "https://example.com/" },
                { type: "italic" },
                { type: "code" },
              ],
            },
          ],
        },
      ],
    });
    expect(shuffled.ok).toBe(true);
    if (!shuffled.ok) return;
    const block = shuffled.document.blocks[0];
    expect(block?.type).toBe("paragraph");
    if (block?.type !== "paragraph") return;
    expect(block.spans[0]?.marks?.map((mark) => mark.type)).toEqual([
      "code",
      "italic",
      "link",
    ]);
    expect(journalMarkRank("code")).toBeLessThan(journalMarkRank("link"));
  });

  it("keeps only the first link on a span, because nested anchors are invalid", () => {
    const result = normalizeJournalDocument({
      schemaVersion: 1,
      blocks: [
        {
          id: "p",
          type: "paragraph",
          spans: [
            {
              text: "x",
              marks: [
                { type: "link", href: "https://a.example/" },
                { type: "link", href: "https://b.example/" },
              ],
            },
          ],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.document.blocks[0];
    if (block?.type !== "paragraph") throw new Error("expected paragraph");
    expect(block.spans[0]?.marks).toEqual([
      { type: "link", href: "https://a.example/" },
    ]);
  });

  it("refuses values outside the closed sets", () => {
    const cases: Array<[unknown, string]> = [
      [{ id: "h", type: "heading", level: 4, spans: [] }, "invalid_block"],
      [
        { id: "l", type: "list", style: "check", items: [{ spans: [] }] },
        "invalid_block",
      ],
      [
        {
          id: "l",
          type: "list",
          style: "unordered",
          items: [{ spans: [], checked: true }],
        },
        "invalid_block",
      ],
      [{ id: "c", type: "callout", icon: "🦄", spans: [] }, "invalid_block"],
      [
        { id: "k", type: "code", language: "brainfuck", text: "" },
        "invalid_block",
      ],
      [{ id: "k", type: "code" }, "invalid_block"],
      [
        {
          id: "p",
          type: "paragraph",
          spans: [{ text: "x", marks: [{ type: "highlight" }] }],
        },
        "invalid_block",
      ],
      [
        { id: "c", type: "callout", icon: "💡", spans: [], extra: 1 },
        "unknown_field",
      ],
    ];
    for (const [block, code] of cases) {
      expect(
        failCode(
          normalizeJournalDocument({ schemaVersion: 1, blocks: [block] }),
        ),
      ).toBe(code);
    }
  });

  it("counts callout and code text as body and as plain text", () => {
    const calloutOnly: JournalDocumentV1 = {
      schemaVersion: 1,
      blocks: [
        {
          id: "c",
          type: "callout",
          icon: DEFAULT_JOURNAL_CALLOUT_ICON,
          spans: [{ text: "Замульчувати до морозів." }],
        },
      ],
    };
    expect(journalDocumentHasMeaningfulBody(calloutOnly)).toBe(true);
    expect(extractJournalDocumentPlainText(calloutOnly)).toBe(
      "Замульчувати до морозів.",
    );
    expect(journalDocumentHasFormatting(calloutOnly)).toBe(true);

    const emptyCode: JournalDocumentV1 = {
      schemaVersion: 1,
      blocks: [{ id: "k", type: "code", language: "plain", text: "   " }],
    };
    expect(journalDocumentHasMeaningfulBody(emptyCode)).toBe(false);
    expect(() => assertMeaningfulJournalDocument(emptyCode)).toThrow();

    const doc = normalizeJournalDocument(NOTION_DOC);
    expect(doc.ok).toBe(true);
    if (!doc.ok) return;
    expect(extractJournalDocumentPlainText(doc.document)).toContain(
      "select 1;",
    );
    expect(extractJournalDocumentPlainText(doc.document)).toContain("полити");
  });

  it("still refuses a third list level", () => {
    expect(
      failCode(
        normalizeJournalDocument({
          schemaVersion: 1,
          blocks: [
            {
              id: "l",
              type: "list",
              style: "todo",
              items: [
                {
                  spans: [{ text: "a" }],
                  items: [
                    {
                      spans: [{ text: "b" }],
                      items: [{ spans: [{ text: "c" }] }],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ),
    ).toBe("invalid_block");
  });
});
