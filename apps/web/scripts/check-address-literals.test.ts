import { describe, expect, it } from "vitest";

import { findAddressLiterals } from "./check-address-literals";

describe("the banned-literal rule (ADR-0029 D12)", () => {
  it.each([
    ['const href = `/journal/${slug}`;', "/journal/"],
    ['const href = "/topics/tomatoes";', "/topics/"],
    ["const href = localizedPath(locale, `/communities/${slug}`);", "/communities/"],
    ['<Link href={`/@${handle}`}>', "/@"],
    ['const path = `/species/${speciesSlug}/${formSlug}`;', "/species/"],
  ])("fails on a reintroduced %s", (line, literal) => {
    const findings = findAddressLiterals("src/app/example.tsx", line);
    expect(findings.map((finding) => finding.literal)).toContain(literal);
    expect(findings[0]!.builders.length).toBeGreaterThan(0);
  });

  it("does not fail on a module specifier that happens to contain one", () => {
    expect(
      findAddressLiterals(
        "src/app/(default)/journal/[slug]/page.tsx",
        'import { Page } from "@/app/[locale]/journal/[slug]/page";',
      ),
    ).toEqual([]);
    expect(
      findAddressLiterals(
        "src/app/example.tsx",
        '} from "@/app/[locale]/topics/[slug]/page";',
      ),
    ).toEqual([]);
  });

  it("does not fail on prose", () => {
    expect(
      findAddressLiterals(
        "src/app/example.tsx",
        "// `/topics/{slug}` is a canonical address and stays one.",
      ),
    ).toEqual([]);
    expect(
      findAddressLiterals(
        "src/app/example.tsx",
        " * A community answers at `/communities/{slug}`.",
      ),
    ).toEqual([]);
  });

  /**
   * A path that is not one of the manifest's namespaces is not this rule's
   * business — `/garden/**` is the workspace, not a public address.
   */
  it("says nothing about a path the manifest does not name", () => {
    expect(
      findAddressLiterals(
        "src/app/example.tsx",
        'redirect(`/garden/catalog/queue?${query}`);',
      ),
    ).toEqual([]);
  });
});
