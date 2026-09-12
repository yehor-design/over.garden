import { describe, expect, it } from "vitest";

import { judgeRenderedPage } from "./prove-public-addresses-render";

const ADDRESS = {
  kind: "entry" as const,
  path: "/@yehor/полив",
  name: "Полив без календарної пастки",
};

const RENDERED = `<html><head><title>Полив</title>
<script type="application/ld+json">{"@context":"https://schema.org"}</script>
</head><body><h1 class="x">Полив без календарної пастки</h1><p>…</p></body></html>`;

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
});
