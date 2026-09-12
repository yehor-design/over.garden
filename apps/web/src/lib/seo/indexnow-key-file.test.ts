import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { INDEXNOW_KEY, INDEXNOW_KEY_FILE, INDEXNOW_KEY_PATH } from "./indexnow";

/**
 * The key file is a static file, and this is the one way it could drift from
 * the constant the submission carries.
 *
 * It lives at the **host root**, not in a subdirectory. The first version of
 * this served it at `/indexnow/{key}.txt`, reading the protocol's
 * `keyLocation` as permission to submit anything; `api.indexnow.org` answered
 * `422 InvalidRequestParameters` — "One or more URLs are not related to your
 * site verified through the keylocation parameter". A key in a subdirectory
 * authorises that subdirectory and nothing else.
 */
describe("the IndexNow key file", () => {
  it("says exactly what the submission says the key is", () => {
    const contents = readFileSync(
      fileURLToPath(new URL(`../../../public/${INDEXNOW_KEY_FILE}`, import.meta.url)),
      "utf8",
    );

    expect(contents.trim()).toBe(INDEXNOW_KEY);
  });

  it("is addressed at the root of the host", () => {
    expect(INDEXNOW_KEY_PATH).toBe(`/${INDEXNOW_KEY_FILE}`);
    expect(INDEXNOW_KEY_PATH.slice(1).includes("/")).toBe(false);
  });
});
