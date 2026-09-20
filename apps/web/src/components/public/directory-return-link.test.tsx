import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  DirectoryReturnLink,
  readDirectoryReturnTarget,
} from "./directory-return-link";

const ORIGIN = "https://over.garden";

describe("the way back to the journals", () => {
  it("serves the plain directory: a working link before anything runs", () => {
    const html = renderToStaticMarkup(
      <DirectoryReturnLink href="/bg/journals" label="Дневници" />,
    );

    expect(html).toContain('href="/bg/journals"');
    expect(html).toContain("Дневници");
  });

  it("restores the view a reader came from, with the directory's own parameters", () => {
    expect(
      readDirectoryReturnTarget("/journals?topic=tomaty&page=2", ORIGIN),
    ).toBe("/journals?topic=tomaty&page=2");
    expect(readDirectoryReturnTarget("/bg/journals?kind=plant", ORIGIN)).toBe(
      "/bg/journals?kind=plant",
    );
    // A parameter the directory does not read never rides along.
    expect(
      readDirectoryReturnTarget("/journals?topic=tomaty&token=opaque", ORIGIN),
    ).toBe("/journals?topic=tomaty");
  });

  it("names nothing but a directory address", () => {
    for (const from of [
      null,
      "",
      "https://evil.example/journals",
      "//evil.example/journals",
      "/garden",
      "/journals#fragment",
      "/@yehor/post/3",
      "/journals/../garden",
      "journals",
      `/journals?q=${"x".repeat(2_000)}`,
    ]) {
      expect(readDirectoryReturnTarget(from, ORIGIN), String(from)).toBeNull();
    }
  });
});
