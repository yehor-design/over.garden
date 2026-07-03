import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CatalogCurationCandidateList } from "./catalog-curation-candidate-list";

describe("CatalogCurationCandidateList", () => {
  it("highlights pilot-origin candidates with aggregate-safe context only", () => {
    const html = renderToStaticMarkup(
      <CatalogCurationCandidateList
        candidates={[
          {
            id: "00000000-0000-4000-8000-000000000201",
            displayName: "Бабусин перець",
            normalizedName: "бабусин перець",
            locale: "und",
            status: "provisional",
            source: "user_added",
            createdAt: "2026-06-26T12:00:00.000Z",
            affectedObjectCount: 2,
            pilotOrigin: true,
            invitedPilotUserCount: 1,
          },
        ]}
        confirmAction={vi.fn()}
        mergeAction={vi.fn()}
        rejectAction={vi.fn()}
      />,
    );

    expect(html).toContain("Pilot signal");
    expect(html).toContain("Your name");
    expect(html).toContain("Saved only for your garden");
    expect(html).toContain("Invited gardeners: 1");
    expect(html).toContain("Objects: 2");
    expect(html).toContain("Бабусин перець");
    expect(html).not.toContain("00000000-0000-0000-0000-000000000001");
  });
});
