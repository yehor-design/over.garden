# Knowledge content provenance — OVE-498

What each authored guide and answer rests on, claim by claim, and what was
taken out because nothing read supports it. The code enforces the shape
(`src/server/public-seo-content.test.ts`). This ledger records the reading.

## What was wrong (OG-UX-033)

- **The answer cited the product as its basis.** The tomato answer gave its
  basis as "Підхід OverGarden до журналу з перевірюваним досвідом", and the
  guide gave "Продуктові й приватнісні принципи OverGarden". Neither is
  evidence for a gardening claim.
- **Both pieces showed "0 публічних записів" in every environment.** Their
  gardeners' entries were read from topics that were never created:
  `watering-and-moisture` and `stress-and-recovery` for the answer,
  `care-checks` for the guide. Production has five curated topics, all of
  them the product's own: `plants`, `animals`, `species`,
  `plant-varieties` and `observation-and-care`. `/topics/breeds` answers
  404. The gate database has five of the same system topics.
- **Product help sat inside the gardening FAQ.** Two of the answer's three
  questions were about OverGarden: publishing a photo, and whether it
  diagnoses. They were in the page's `FAQPage` as if they were about tomatoes.

## The tomato answer — `/answers/why-are-tomato-leaves-yellow`

- **Subject:** gardening.
- **Author:** Редакція OverGarden.
- **Updated:** 2026-09-23.
- **Specialist review:** none. The page says so: "Агроном чи фахівець із
  захисту рослин цей текст не перевіряв."

### Sources

All four were read on 2026-09-23 from the pages' own text, fetched in full,
not from a summary.

| # | Source | Date the page shows |
|---|---|---|
| 1 | University of Maryland Extension, [Key to Common Problems of Tomatoes](https://extension.umd.edu/resource/key-common-problems-tomatoes) | updated 18 June 2025 |
| 2 | University of Wisconsin–Madison Division of Extension (Bruce Spangenberg), [Troubleshooting Tomato Problems](https://hort.extension.wisc.edu/troubleshooting-tomato-problems/) | posted 28 July 2025 |
| 3 | Royal Horticultural Society, [Tomatoes: leaf problems](https://www.rhs.org.uk/problems/tomatoes-leaf-problems) | none shown |
| 4 | University of Maryland Extension, [Vegetable Seedlings or Transplant Leaves Yellowing, Turning White, or are Spotted or Scorched](https://extension.umd.edu/resource/vegetable-seedlings-or-transplant-leaves-yellowing-turning-white-or-are-spotted-or-scorched) | updated 20 February 2023 |

### Claims

What each source says is paraphrased here, with where on its page it says
it. Sentences are the Ukrainian text, abridged. The Bulgarian and Russian
texts make the same claims with the same citation marks.

| Claim | Rests on | What the source says, and where |
|---|---|---|
| Short answer: fungal leaf spots on the lower leaves, a shortage of nitrogen or magnesium, a wilt, spider mites and, in young plants, cold, compacted, waterlogged or dry soil | 1, 2, 3, 4 | The rows below. |
| Dark spots on the lower leaves first, then yellowing or browning: often a fungal leaf spot (early blight, septoria) that spreads in wet weather | 1, 2 | **1**, key table, "Leaf Spots": early blight affects the lower leaves first; early blight and septoria are both "very common"; septoria's lesions turn leaves yellow, and it is favoured by wet weather. **2**: both diseases start on the lower foliage as dark spots, followed by yellowing or browning, especially in wet weather. |
| The older, lower leaves yellow first, then the younger ones: a shortage of nitrogen, especially in containers, from frequent watering and poor soil | 1, 2 | **1**, key table, "Leaf Yellowing": older leaves first, then newer leaves, is nitrogen. **2**: lack of nitrogen is especially common in containers, from frequent watering and low soil fertility. |
| Yellow between the veins of the older leaves: most often a shortage of magnesium. Only on the older leaves, the RHS sees no cause for concern | 1, 3 | **1**: interveinal yellowing is potassium, iron, magnesium or manganese. **3**, "Symptoms and causes": yellow areas between the veins of older leaves are usually magnesium deficiency, no cause for concern when only in the older leaves. |
| The lower leaves yellow and the stems wilt, often on one side: possibly Fusarium or Verticillium wilt, fungi that live in the soil | 1 | **1**, key table, "Leaf Yellowing": lower leaves yellowing and stems wilting are Fusarium or Verticillium wilt. The Fusarium photo notes one-sided yellowing, and the entry names a soil-borne fungus. |
| Tiny yellow specks, the leaf's underside looking dirty: spider mites, common in heat and drought | 1 | **1**, key table: tiny yellow spots (stippling) and dirty-looking undersides are spider mites, common in hot, dry weather. |
| Young plants and fresh transplants also yellow from their conditions: cold, compacted or waterlogged soil, drought, swings of temperature | 4 | **4**, "Environmental stress": the stressors named for seedlings and transplants include temperature extremes and swings, cold, compacted or waterlogged soil, and drought. |
| FAQ, "Коли жовте листя — не привід для тривоги?": yellowing between the veins of the older leaves only, on an otherwise vigorous plant, is no cause for concern. Spots, specks, wilting, or yellowing that climbs to the young leaves are worth a closer look | 3, 1 | **3**, as above, and older-leaf discolouration is "less serious" while the plant is otherwise vigorous. **1**, the rows on spots, stippling and wilts above. |

### What asserts nothing, and needs no source

- **"Що записати, щоб знайти причину".** The editors' own list of what to
  observe. It describes a method and makes no claim about plants.
- **The first FAQ, "Яка деталь найважливіша при жовтінні листя?".** Its
  answer is the same method: where the yellowing started, what changed before
  it, and what happened after.

### Taken out, because nothing read supports it as it was worded

- **"Старіння нижніх листків" as a cause in itself.** Source 1 ties "older
  leaves first" to nitrogen, and source 3 treats older-leaf yellowing as a
  nutrient question. Neither page says old leaves yellow simply with age.
- **"Водний стрес", "поганий дренаж" and "стрес коренів".** These are now the
  conditions source 4 names: waterlogged or dry, cold or compacted soil, said
  of young plants and transplants, which is whom the source addresses.
- **"Найшвидша корисна дія — записати…".** It is replaced by the pattern that
  tells the causes apart, which the sources' keys are organised by.

### Qualifications on the page

- It is not a diagnosis. Yellowing has several causes, and a description or a
  photograph can only narrow them.
- The sources describe gardens in the United States and the United Kingdom.
  Which diseases are common, and when, differs by region.

### Product help, kept apart

"Як записати це в OverGarden" (`AnswerProductHelp`) replaces the two product
questions that were in the FAQ, and is not in the `FAQPage`:

- OverGarden does not diagnose. It keeps dated entries about the same plant.
- The photo and publishing sentences are the wording `OVE-476` verified
  against the product. Their key in `OVE-476-CLAIM-LEDGER.json` is
  `ANSWER_TRANSLATIONS.*.why-are-tomato-leaves-yellow.faqs.0.answer`.

### Gardeners' entries and related

- **Entries beside the answer:** those about objects linked to the tomato
  species (`catalogSlugs: ["solanum-lycopersicum"]`). Production showed 9 on
  2026-09-23 (`/journals?catalog=solanum-lycopersicum`). The section says
  what they are: gardeners' own observations, which neither confirm nor
  refute the text.
- **Related:** the `plants` topic, listed only while it holds an entry a
  listing can show.

## The first-record guide — `/guides/start-a-living-plant-record`

- **Subject:** help with OverGarden.
- **Author:** Редакція OverGarden.
- **Updated:** 2026-09-23.
- **Basis:** how OverGarden works on that date: publishing, photographs and
  what is kept. It cites no outside source, and the page says so.
- **Qualification:** "Це довідка про OverGarden, а не садівнича порада." There
  is no specialist-review line, because help with the product is not advice.
- **What it says of the product:**
  - The photo is optional, the browser prepares it, and the original is not
    kept. This is the sentence `OVE-476` verified, the same one the privacy
    and composer copy use.
  - Step 4 no longer calls the second entry "доказ". It says the second note
    turns the notes into a history.
- **Entries beside it:** other gardeners' records under `plants`, as examples
  of what a record looks like.
- **Related:** the tomato answer.
- **Removed:** the unrendered related links, which described the blog post
  as "positioning behind public discovery".

## Counts, in the hub and on topics

- **What a topic counts.** A topic now counts only entries a listing can show:
  those whose author holds a handle (ADR-0029 D9). The evidence query takes
  its hundred ids by the same rule.
- **Production.** No count changes. `plants` showed 9 in its header and 9 in
  its list, and `animals` 2 and 2, before this change.
- **The gate database.** It held 156 `plants` entries, all by authors without
  a handle. The header said 156 over a list of none.

## Adding a piece

`src/server/public-seo-content.test.ts` fails a piece that breaks any of
these:

- **Sources by subject.** Gardening advice cites at least one source, each
  with a URL, a language and the date it was read. Help with the product
  cites none.
- **Citations.** Every `[n]` in every language names a source the piece has,
  and every source is cited. Nothing a machine reads keeps the marks.
- **Topics.** The gardeners' entries and the related topics are drawn from
  topics the product creates (`SYSTEM_TOPIC_SLUGS`).
- **Wording.** No editorial meta says "principle", "proof-first" or
  "guidance".
