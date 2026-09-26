import { describe, expect, it } from "vitest";

import {
  parseReportAddress,
  parseReportForm,
  reportAddressPath,
  reportHref,
} from "./report-contract";

describe("the report form's address", () => {
  it("reads the four reportable page shapes, with or without a language", () => {
    expect(parseReportAddress("/@olena/post/7")).toEqual({
      kind: "entry",
      handle: "olena",
      entryNumber: 7,
    });
    expect(parseReportAddress("/bg/@olena/post/7")).toEqual({
      kind: "entry",
      handle: "olena",
      entryNumber: 7,
    });
    expect(parseReportAddress("/@olena/objects/pomidor-na-balkoni")).toEqual({
      kind: "object",
      handle: "olena",
      slug: "pomidor-na-balkoni",
    });
    expect(parseReportAddress("/ru/@olena")).toEqual({
      kind: "profile",
      handle: "olena",
    });
    expect(parseReportAddress("/topics/care-checks")).toEqual({
      kind: "topic",
      slug: "care-checks",
    });
    // An encoded `@` is the same address.
    expect(parseReportAddress("/%40olena")).toEqual({
      kind: "profile",
      handle: "olena",
    });
  });

  it("refuses anything else, and anything off this site", () => {
    for (const value of [
      "",
      "/garden",
      "/@olena/post/0",
      "/@olena/post/x",
      "/species/solanum-lycopersicum",
      "https://evil.example/@olena",
      "//evil.example/@olena",
      42,
      null,
    ]) {
      expect(parseReportAddress(value), String(value)).toBeNull();
    }
  });

  it("records the canonical path and links the form with it", () => {
    const address = parseReportAddress("/bg/@Olena/post/7")!;
    expect(reportAddressPath(address)).toBe("/@olena/post/7");
    expect(reportHref("/@olena/post/7")).toBe(
      "/report?address=%2F%40olena%2Fpost%2F7",
    );
  });
});

describe("the report form's fields", () => {
  const valid = {
    address: "/@olena/post/7",
    reason: "harassment",
    explanation: "Погрози в тексті запису.",
    name: " Ірина ",
    email: " Iryna@Example.test ",
    goodFaith: "on",
  };

  it("takes a complete report, trimmed, the email in lower case", () => {
    expect(parseReportForm(valid)).toEqual({
      ok: true,
      input: {
        address: { kind: "entry", handle: "olena", entryNumber: 7 },
        reason: "harassment",
        explanation: "Погрози в тексті запису.",
        name: "Ірина",
        email: "iryna@example.test",
      },
    });
  });

  it("names every field that is missing or wrong", () => {
    expect(
      parseReportForm({
        address: "/garden",
        reason: "rude",
        explanation: "short",
        name: "",
        email: "not-an-email",
      }),
    ).toEqual({
      ok: false,
      errors: [
        "address",
        "reason",
        "explanation",
        "name",
        "email",
        "goodFaith",
      ],
    });
  });
});
