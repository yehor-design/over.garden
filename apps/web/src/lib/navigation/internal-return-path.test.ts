import { describe, expect, it } from "vitest";

import {
  InternalReturnPathError,
  normalizeInternalReturnPath,
  parseInternalReturnPath,
} from "./internal-return-path";

describe("internal return path", () => {
  it.each([
    "/",
    "/journal/balcony-tomato-check?tab=history#comments",
    "/bg/notifications?filter=comments&view=grouped",
    "/garden/objects/18700003-0000-4000-8000-000000000001",
    "/communities/observation-and-care?q=%D0%B4%D0%BE%D0%BC%D0%B0%D1%82%D0%B8",
  ])("canonicalizes a same-origin path %s", (value) => {
    const path = parseInternalReturnPath(value);

    expect(path).toBe(value);
    expect(new URL(path, "https://over.garden").origin).toBe(
      "https://over.garden",
    );
  });

  it.each([
    "https://attacker.example/steal",
    "//attacker.example/steal",
    "/\\attacker.example/steal",
    "/%5cattacker.example/steal",
    "/%2f%2fattacker.example/steal",
    "/%252f%255cattacker.example/steal",
    "/journal/entry%0aLocation: attacker",
    "/journal/entry%250dLocation: attacker",
    "/journal/%",
    " /journal/entry",
  ])("rejects encoded and direct origin-changing forms %s", (value) => {
    expect(() => parseInternalReturnPath(value)).toThrow(
      InternalReturnPathError,
    );
  });

  it("falls back only to a canonical application path", () => {
    expect(
      normalizeInternalReturnPath(
        "/%252f%255cattacker.example/steal",
        "/garden",
      ),
    ).toBe("/garden");
  });

  it("parses the bounded attack corpus within the return-path budget", () => {
    const corpus = [
      "/journal/balcony-tomato-check?tab=history#comments",
      "/bg/notifications?filter=comments&view=grouped",
      "/%5cattacker.example/steal",
      "/%252f%255cattacker.example/steal",
      "/journal/entry%250dLocation: attacker",
    ];
    const start = performance.now();

    for (const value of corpus) {
      try {
        parseInternalReturnPath(value);
      } catch (error) {
        expect(error).toBeInstanceOf(InternalReturnPathError);
      }
    }

    expect(performance.now() - start).toBeLessThan(5);
  });
});
