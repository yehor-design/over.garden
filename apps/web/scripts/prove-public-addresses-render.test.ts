import { describe, expect, it } from "vitest";

import { judgeRenderedPage } from "./prove-public-addresses-render";

const ADDRESS = {
  kind: "entry" as const,
  path: "/@yehor/post/12",
  name: "Полив без календарної пастки",
  expects: "page" as const,
};

/** An older spelling of the same entry: its name under its author. */
const OLDER_SPELLING = {
  kind: "entry" as const,
  path: "/bg/@yehor/полив",
  name: "полив → /@yehor/post/12",
  expects: "redirect" as const,
  redirectsTo: "/@yehor/post/12",
};

const NOTHING = {
  kind: "passport" as const,
  path: "/@yehor/objects/there-is-nothing-at-this-address",
  name: "a passport that does not exist",
  expects: "not_found" as const,
};

const RENDERED = `<html lang="uk"><head><title>Полив</title>
<script type="application/ld+json">{"@context":"https://schema.org","inLanguage":"uk"}</script>
</head><body><main lang="uk"><h1 class="x">Полив без календарної пастки</h1><p>…</p></main></body></html>`;

/** What the not-found page looks like inside a `200`. */
const APOLOGY = `<html><head><title>Полив · Запис журналу | OverGarden</title></head>
<body><main><p>OverGarden</p><h1 class="y">Сторінку не знайдено</h1></main></body></html>`;

describe("the address render proof", () => {
  it("accepts a page that rendered", () => {
    expect(judgeRenderedPage(ADDRESS, 200, RENDERED)).toMatchObject({
      ok: true,
      why: null,
      jsonLdBlocks: 1,
      heading: "Полив без календарної пастки",
    });
  });

  // The defect this whole script exists for: the status line says 200, the
  // title is the entry's own, and the body is an apology.
  it("refuses the not-found page served inside a 200", () => {
    expect(judgeRenderedPage(ADDRESS, 200, APOLOGY)).toMatchObject({
      ok: false,
      why: "no JSON-LD on an indexable surface",
      heading: "Сторінку не знайдено",
    });
  });

  it("refuses a shell with no heading at all", () => {
    expect(
      judgeRenderedPage(ADDRESS, 200, "<html><body><nav>…</nav></body></html>"),
    ).toMatchObject({ ok: false, why: "no heading in the HTML" });
  });

  it("refuses anything that is not a 200", () => {
    expect(judgeRenderedPage(ADDRESS, 404, APOLOGY)).toMatchObject({
      ok: false,
      why: "status 404",
    });
  });

  // The mirror image: an address that is nothing must say so in the status
  // line, because that is the only place a crawler reads it.
  it("requires a real 404 for an address that is nothing", () => {
    expect(judgeRenderedPage(NOTHING, 404, APOLOGY)).toMatchObject({
      ok: true,
      why: null,
    });
    expect(judgeRenderedPage(NOTHING, 200, APOLOGY)).toMatchObject({
      ok: false,
      why: "status 200 for an address that is nothing",
    });
    expect(judgeRenderedPage(NOTHING, 200, RENDERED)).toMatchObject({
      ok: false,
    });
  });

  /**
   * OVE-424: a record declares its own language on its content element and
   * in its graph. This is a consistency check on each record, not a filter —
   * the page chrome may be Ukrainian while the entry is Bulgarian.
   */
  it("requires the record's language on the content element and in the graph", () => {
    const bulgarian = { ...ADDRESS, language: "bg" };
    const rendered = RENDERED.replace('<main lang="uk">', '<main lang="bg">').replace(
      '"inLanguage":"uk"',
      '"inLanguage":"bg"',
    );
    expect(judgeRenderedPage(bulgarian, 200, rendered)).toMatchObject({ ok: true });
    expect(judgeRenderedPage(bulgarian, 200, RENDERED)).toMatchObject({
      ok: false,
      why: "the page does not declare bg on its content and in its graph",
    });
    // Without a language on the address, nothing is asked about it.
    expect(judgeRenderedPage(ADDRESS, 200, RENDERED)).toMatchObject({ ok: true });
  });

  // An entry is addressed by its number (ADR-0029 D9); every address it had
  // before must reach the number in one response.
  it("accepts one 308 straight to the entry's number", () => {
    expect(
      judgeRenderedPage(
        OLDER_SPELLING,
        308,
        "",
        "https://over.garden/@yehor/post/12",
      ),
    ).toMatchObject({ ok: true, why: null });
    // A relative `Location` names the same path.
    expect(
      judgeRenderedPage(OLDER_SPELLING, 308, "", "/@yehor/post/12"),
    ).toMatchObject({ ok: true });
  });

  // The defect the first draft had: the locale prefix was stripped first, so
  // `/bg/@yehor/полив` answered 308 to `/@yehor/полив`, which answered 308
  // again. Each response was correct; the chain was the defect.
  it("refuses a 308 that lands on another older spelling", () => {
    expect(
      judgeRenderedPage(
        OLDER_SPELLING,
        308,
        "",
        `https://over.garden/@yehor/${encodeURIComponent("полив")}`,
      ),
    ).toMatchObject({
      ok: false,
      why: `308 to /@yehor/${encodeURIComponent("полив")}, not to /@yehor/post/12: a second hop`,
    });
  });

  it("refuses an older spelling that renders, or is temporary, or is gone", () => {
    for (const status of [200, 301, 302, 307, 404]) {
      expect(
        judgeRenderedPage(OLDER_SPELLING, status, "", "/@yehor/post/12"),
      ).toMatchObject({
        ok: false,
        why: `status ${status} for an address that must answer 308`,
      });
    }
    expect(judgeRenderedPage(OLDER_SPELLING, 308, "", null)).toMatchObject({
      ok: false,
    });
  });
});
