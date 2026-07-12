import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { LocationPrivacyControl } from "./location-privacy-control";

describe("LocationPrivacyControl", () => {
  it("explains public consequences where the gardener selects visibility", () => {
    const html = renderToStaticMarkup(
      <LocationPrivacyControl
        objectId="00000000-0000-4000-8000-000000000001"
        currentLocationVisibility="region"
        currentCoarseRegionCode="UA-30"
        action={vi.fn()}
      />,
    );

    expect(html).toContain("region can appear");
    expect(html).toContain("Exact location is never shown");
    expect(html).toContain("min-w-0");
    expect(html).not.toMatch(
      /\b(address|coordinates?|latitude|longitude|ip_address|user[_ -]?agent)\b/i,
    );
  });
});
