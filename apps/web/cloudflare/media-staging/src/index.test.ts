import { describe, expect, it } from "vitest";

import { corsHeaders, parseWorkerRoute } from "./http-policy";

describe("media staging Worker HTTP boundary", () => {
  it("allows only exact first-party origins and closed methods", () => {
    expect(corsHeaders("https://over.garden", "PUT")).toEqual(
      expect.objectContaining({
        "Access-Control-Allow-Origin": "https://over.garden",
        Vary: "Origin",
      }),
    );
    // OVE-372: an upload's dimensions travel as headers; the preflight must
    // admit them or the browser never sends the PUT.
    expect(
      corsHeaders("https://over.garden", "PUT")?.["Access-Control-Allow-Headers"],
    ).toMatch(/X-Media-Width, X-Media-Height/);
    expect(corsHeaders("https://attacker.example", "PUT")).toBeNull();
    expect(corsHeaders("https://over.garden", "PATCH")).toBeNull();
  });

  it("parses only UUID-scoped upload/delete and session claim/finalize paths", () => {
    const session = "00000000-0000-4000-8000-000000000002";
    const media = "00000000-0000-4000-8000-000000000003";
    expect(
      parseWorkerRoute(`/v1/staging/${session}/${media}/2`, "PUT"),
    ).toEqual({
      operation: "upload",
      stagingSessionId: session,
      mediaAssetId: media,
      generation: 2,
      variant: 0,
    });
    expect(
      parseWorkerRoute(`/v1/staging/${session}/${media}/2`, "DELETE"),
    ).toEqual(expect.objectContaining({ operation: "delete" }));
    expect(parseWorkerRoute(`/v1/staging/${session}/claim`, "POST")).toEqual({
      operation: "claim",
      stagingSessionId: session,
    });
    expect(parseWorkerRoute(`/v1/staging/${session}/finalize`, "POST")).toEqual(
      {
        operation: "finalize",
        stagingSessionId: session,
      },
    );
    expect(
      parseWorkerRoute("/v1/staging/not-a-session/claim", "POST"),
    ).toBeNull();
  });
});
