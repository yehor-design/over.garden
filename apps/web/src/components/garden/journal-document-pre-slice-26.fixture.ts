import { publicJournalEntryPath } from "@/lib/garden/public-paths";
import type { JournalDocumentV1 } from "@/lib/garden/journal-document";

/**
 * Every block and every mark a `JournalDocumentV1` could hold **before**
 * Slice 26 — and nothing that came after.
 *
 * ADR-0028 grew the contract additively at schema version 1, and its one hard
 * promise is that an entry published before it must still render byte for
 * byte the same. That promise is only testable against a document that uses
 * the old surface, so the old surface is written out here in full rather than
 * sampled: paragraph, heading at levels 2 and 3, ordered and unordered lists
 * two levels deep, a quote with an attribution, a delimiter, an image, and
 * the marks `bold`, `italic` and `link` — the list ADR-0028 §38 records as
 * what the contract held when it arrived.
 *
 * What is deliberately absent: the to-do list, the callout, the code block,
 * the marks `underline`, `strikethrough` and `code`, and a level-1 heading.
 * Those are Slice 26's, so an entry published before it cannot contain them,
 * and putting them in this fixture would make the guarantee weaker rather
 * than stronger — it would stop being a statement about old entries.
 *
 * This is stronger than a sample of production rows in one way and weaker in
 * another. Stronger: it covers the whole pre-Slice-26 surface, where the rows
 * cover whatever the gardeners happened to write. Weaker: it is not literally
 * their prose. `journal-document-renderer.test.tsx` says what the golden file
 * beside it is for.
 */
export const PRE_SLICE_26_DOCUMENT: JournalDocumentV1 = {
  schemaVersion: 1,
  blocks: [
    {
      id: "b-paragraph",
      type: "paragraph",
      spans: [
        { text: "Ранковий полив о " },
        { text: "шостій", marks: [{ type: "bold" }] },
        { text: ", ґрунт просох на " },
        { text: "два сантиметри", marks: [{ type: "italic" }] },
        { text: "." },
      ],
    },
    {
      id: "b-heading-2",
      type: "heading",
      level: 2,
      spans: [{ text: "Що змінилося за тиждень" }],
    },
    {
      id: "b-paragraph-breaks",
      type: "paragraph",
      spans: [{ text: "Перший рядок\nдругий рядок" }],
    },
    {
      id: "b-heading-3",
      type: "heading",
      level: 3,
      spans: [{ text: "Листя" }],
    },
    {
      id: "b-list-unordered",
      type: "list",
      style: "unordered",
      items: [
        {
          spans: [{ text: "Нижнє листя тримає колір" }],
          items: [{ spans: [{ text: "без плям на зворотному боці" }] }],
        },
        { spans: [{ text: "Новий приріст рівний" }] },
      ],
    },
    {
      id: "b-list-ordered",
      type: "list",
      style: "ordered",
      items: [
        {
          spans: [{ text: "Полив" }],
          items: [{ spans: [{ text: "два літри на кущ" }] }],
        },
        { spans: [{ text: "Підв'язка" }] },
      ],
    },
    {
      id: "b-quote",
      type: "quote",
      spans: [{ text: "Полив уранці, поки лист не нагрівся." }],
      attributionSpans: [
        { text: "Довідник, " },
        {
          text: "сторінка 42",
          marks: [
            { type: "link", href: "/guides/start-a-living-plant-record" },
          ],
        },
      ],
    },
    { id: "b-delimiter", type: "delimiter" },
    {
      id: "b-paragraph-links",
      type: "paragraph",
      spans: [
        { text: "Порівняв з " },
        {
          text: "минулим записом",
          // Built rather than spelled: `check-address-literals.ts` refuses a
          // `/@…` written by hand, and the bytes are identical either way.
          marks: [
            { type: "link", href: publicJournalEntryPath("olena", "polyv") },
          ],
        },
        { text: " і з " },
        {
          text: "зовнішнім джерелом",
          marks: [{ type: "link", href: "https://example.test/tomato" }],
        },
        { text: "." },
      ],
    },
    { id: "b-image", type: "image", mediaAssetId: "media-1" },
    { id: "b-image-missing", type: "image", mediaAssetId: "media-absent" },
  ],
};

/** The one image the fixture's document resolves, with a real caption. */
export const PRE_SLICE_26_IMAGES = new Map([
  [
    "media-1",
    {
      mediaAssetId: "media-1",
      src: "https://media.over.garden/derivatives/fixture/1.webp",
      alt: "Грядка з томатами у вечірньому світлі",
      caption: "Грядка з томатами у вечірньому світлі",
      width: 1_600,
      height: 900,
      focalX: 0.5,
      focalY: 0.45,
    },
  ],
]);
