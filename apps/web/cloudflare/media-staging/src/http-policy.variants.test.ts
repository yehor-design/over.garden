import { describe, expect, it } from "vitest";

import { parseWorkerRoute } from "./http-policy";

describe("media staging Worker variant routes (OVE-371)", () => {
  const session = "00000000-0000-4000-8000-000000000002";
  const media = "00000000-0000-4000-8000-000000000003";

  it("names a variant by its long edge behind the generation", () => {
    expect(
      parseWorkerRoute(`/v1/staging/${session}/${media}/2/v1280`, "PUT"),
    ).toEqual({
      operation: "upload",
      stagingSessionId: session,
      mediaAssetId: media,
      generation: 2,
      variant: 1280,
    });
    expect(
      parseWorkerRoute(`/v1/staging/${session}/${media}/2/v480`, "DELETE"),
    ).toEqual(expect.objectContaining({ operation: "delete", variant: 480 }));
    expect(
      parseWorkerRoute(`/v1/staging/${session}/${media}/2`, "PUT"),
    ).toEqual(expect.objectContaining({ variant: 0 }));
  });

  it("refuses long edges the contract does not know", () => {
    expect(
      parseWorkerRoute(`/v1/staging/${session}/${media}/2/v2560`, "PUT"),
    ).toBeNull();
    expect(
      parseWorkerRoute(`/v1/staging/${session}/${media}/2/v0`, "PUT"),
    ).toBeNull();
    expect(
      parseWorkerRoute(`/v1/staging/${session}/${media}/2/1280`, "PUT"),
    ).toBeNull();
    expect(
      parseWorkerRoute(`/v1/staging/${session}/${media}/2/v1280/extra`, "PUT"),
    ).toBeNull();
  });
});
