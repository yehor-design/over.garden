import { describe, expect, it } from "vitest";

import { INDEXNOW_KEY, INDEXNOW_KEY_FILE } from "@/lib/seo/indexnow";
import { GET, generateStaticParams } from "./route";

describe("the IndexNow key file", () => {
  it("serves the key as plain text at 200", async () => {
    const response = await GET(new Request("https://over.garden"), {
      params: Promise.resolve({ keyFile: INDEXNOW_KEY_FILE }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    await expect(response.text()).resolves.toBe(INDEXNOW_KEY);
  });

  /**
   * A dynamic segment that echoed whatever it was handed would give every
   * reader a valid-looking key file for a key that is not this host's — the
   * one thing the protocol asks a host not to do.
   */
  it("refuses any other file name", async () => {
    for (const keyFile of ["someone-elses-key.txt", INDEXNOW_KEY, "../secret"]) {
      const response = await GET(new Request("https://over.garden"), {
        params: Promise.resolve({ keyFile }),
      });
      expect(response.status, keyFile).toBe(404);
    }
  });

  it("prerenders exactly the one file", () => {
    expect(generateStaticParams()).toEqual([{ keyFile: INDEXNOW_KEY_FILE }]);
  });
});
