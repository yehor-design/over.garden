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
    expect(lineageClaimTokenFromHash("#token=v2.2.payload.signature")).toBe(
      "v2.2.payload.signature",
    );
    expect(
      lineageClaimTokenFromHash("#token=v2.9007199254740991.payload.signature"),
    ).toBe("v2.9007199254740991.payload.signature");
    expect(lineageClaimTokenFromHash("?token=v1.payload.signature")).toBeNull();
    expect(
      lineageClaimTokenFromHash("#token=v2.02.payload.signature"),
    ).toBeNull();
    expect(
      lineageClaimTokenFromHash("#token=javascript%3Aalert(1)"),
    ).toBeNull();
    expect(lineageClaimTokenFromHash(`#token=${"x".repeat(4097)}`)).toBeNull();
  });

  it("never server-renders a token or a hidden token input", () => {
    const html = renderToStaticMarkup(<LineageClaimHandoff locale="bg" />);

    expect(html).toContain("Отваряме поканата");
    expect(html).toContain('data-invitation-state="preparing"');
    expect(html).not.toMatch(/name="token"|v1\.payload\.signature/i);
  });

  it("says nothing beside a stored invitation until a newer link is in the address", () => {
    // Beside a stored invitation the handoff waits for a fragment the server
    // cannot see; without one there is nothing to replace and nothing to say.
    expect(
      renderToStaticMarkup(<LineageClaimHandoff locale="uk" replacing />),
    ).toBe("");
  });

  it("tells an expired link from a broken one, and both from a lost request", () => {
    expect(
      classifyLineageClaimHandoffResponse(400, {
        error: "lineage_invitation_expired",
      }),
    ).toBe("expired");
    expect(
      classifyLineageClaimHandoffResponse(400, {
        error: "lineage_invitation_invalid",
      }),
    ).toBe("invalid");
    // A 400 without a code is still a link the server refused, never a retry.
    expect(classifyLineageClaimHandoffResponse(400, null)).toBe("invalid");
    expect(classifyLineageClaimHandoffResponse(408, null)).toBe("retry");
    expect(classifyLineageClaimHandoffResponse(429, null)).toBe("retry");
    expect(classifyLineageClaimHandoffResponse(503, null)).toBe("retry");
    expect(classifyLineageClaimHandoffResponse(200, null)).toBe("retry");
    expect(
      classifyLineageClaimHandoffResponse(200, {
        next: "/garden/lineage/invitations/claim",
      }),
    ).toBe("success");
  });
});
