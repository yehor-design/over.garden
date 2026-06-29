import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { gardenFirstEntryInvitePath } from "@/lib/garden/public-paths";
import JoinPage, { metadata } from "./page";

describe("/join closed-cohort invite", () => {
  it("stays out of search indexes for the closed pilot", () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });

  it("carries only the enum cohort source into the first-entry flow", () => {
    const html = renderToStaticMarkup(<JoinPage />);

    expect(gardenFirstEntryInvitePath()).toBe("/garden?source=invited-cohort");
    expect(html).toContain('href="/garden?source=invited-cohort"');
    expect(html).not.toContain("invite=");
    expect(html).not.toContain("token");
  });

  it("uses calm, non-technical invite copy without jargon or PII", () => {
    const html = renderToStaticMarkup(<JoinPage />);
    // Strip href targets so the legitimate ?source=invited-cohort slug in links
    // is not mistaken for jargon in the visible copy.
    const visibleCopy = html.replace(/href="[^"]*"/g, "");

    expect(html).toContain("invited");
    expect(html).toMatch(/first plant note/i);
    expect(visibleCopy).not.toMatch(
      /\b(noindex|activation[_ ]?source|invited_cohort|cohort|enum|analytics)\b/i,
    );
    expect(visibleCopy).not.toMatch(
      /\b(address|coordinates?|latitude|longitude|email|ip_address|user[_ -]?agent)\b/i,
    );
  });
});
