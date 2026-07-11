import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { lineageClaimTokenFromHash } from "@/lib/lineage/claim-handoff";
import {
  classifyLineageClaimHandoffResponse,
  LineageClaimHandoff,
} from "./claim-handoff";

describe("lineage claim browser handoff", () => {
  it("extracts only a bounded signed token from the fragment", () => {
    expect(lineageClaimTokenFromHash("#token=v1.payload.signature")).toBe(
      "v1.payload.signature",
    );
    expect(lineageClaimTokenFromHash("?token=v1.payload.signature")).toBeNull();
    expect(
      lineageClaimTokenFromHash("#token=javascript%3Aalert(1)"),
    ).toBeNull();
    expect(lineageClaimTokenFromHash(`#token=${"x".repeat(4097)}`)).toBeNull();
  });

  it("never server-renders a token or a hidden token input", () => {
    const html = renderToStaticMarkup(<LineageClaimHandoff />);

    expect(html).toContain("Preparing the private invitation");
    expect(html).not.toMatch(/name="token"|v1\.payload\.signature/i);
  });

  it("distinguishes permanent invite failures from retryable handoff failures", () => {
    expect(classifyLineageClaimHandoffResponse(400, null)).toBe("unavailable");
    expect(classifyLineageClaimHandoffResponse(408, null)).toBe("retry");
    expect(classifyLineageClaimHandoffResponse(429, null)).toBe("retry");
    expect(classifyLineageClaimHandoffResponse(503, null)).toBe("retry");
    expect(classifyLineageClaimHandoffResponse(200, null)).toBe("retry");
    expect(
      classifyLineageClaimHandoffResponse(
        200,
        "/garden/lineage/invitations/claim",
      ),
    ).toBe("success");
  });
});
