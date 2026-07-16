import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { VarietySeedProofEditor } from "./variety-seed-proof-editor";

describe("VarietySeedProofEditor", () => {
  it("localizes proof controls without changing catalog content", () => {
    const html = renderToStaticMarkup(
      <VarietySeedProofEditor
        locale="bg"
        seedProofs={[
          {
            id: "00000000-0000-4000-8000-000000000701",
            catalogItemId: "00000000-0000-4000-8000-000000000702",
            catalogCanonicalName: "Rosa gallica",
            catalogPublicSlug: "rosa-gallica",
            catalogStatus: "seeded",
            catalogLocale: "la",
            title: "Source-backed variety proof",
            summary: "A concise source-backed summary.",
            body: "A sufficiently long source-backed proof body retained verbatim for operator review and publication decisions.",
            sourceLabel: "European official source",
            status: "draft",
            publishedAt: null,
            updatedAt: "2026-07-16T12:00:00.000Z",
          },
        ]}
        upsertAction={vi.fn()}
      />,
    );

    expect(html).toContain("Блокове с доказателства за сорта");
    expect(html).toContain("Нов блок с доказателства");
    expect(html).toContain("Търсене на елемент от каталога");
    expect(html).toContain("Запазване на доказателството");
    expect(html).toContain("Чернова");
    expect(html).toContain("Публична страница");
    expect(html).toContain("Rosa gallica");
    expect(html).toContain("Source-backed variety proof");
    expect(html).not.toContain("Save proof");
  });
});
