import { describe, expect, it } from "vitest";
import { scanInterfaceIcons } from "./check-interface-icons";

describe("single interface icon family", () => {
  it.each([
    ['import { X } from "lucide-react";', "families are retired"],
    [
      'import { XIcon } from "@phosphor-icons/react/dist/ssr/X";',
      "through @/components/icons",
    ],
    ['import { XIcon } from "@/components/icons";', "named local icon module"],
    ['const control = <svg><path d="" /></svg>;', "Bespoke interface SVG"],
    ['const control = <button aria-label="Add">➕</button>;', "Emoji is not"],
  ])("rejects a competing icon source: %s", (source, message) => {
    expect(
      scanInterfaceIcons("src/components/example.tsx", source)[0]?.reason,
    ).toContain(message);
  });
  it("refuses the full Phosphor barrel inside the entry point", () => {
    expect(
      scanInterfaceIcons(
        "src/components/icons/index.ts",
        'import { XIcon } from "@phosphor-icons/react";',
      )[0]?.reason,
    ).toContain("narrow server-compatible");
  });
  it("allows the typed entry point, narrow SSR imports and explicit brands", () => {
    expect(
      scanInterfaceIcons(
        "src/components/example.tsx",
        'import { XIcon } from "@/components/icons/X";',
      ),
    ).toEqual([]);
    expect(
      scanInterfaceIcons(
        "src/components/icons/index.ts",
        'import { XIcon } from "@phosphor-icons/react/dist/ssr/X";',
      ),
    ).toEqual([]);
    expect(
      scanInterfaceIcons(
        "src/components/icons/interface-icon.tsx",
        'import type { Icon } from "@phosphor-icons/react";',
      ),
    ).toEqual([]);
    expect(
      scanInterfaceIcons(
        "src/components/site-shell/over-garden-logo.tsx",
        "const brand = <svg />;",
      ),
    ).toEqual([]);
    expect(
      scanInterfaceIcons(
        "src/lib/garden/document.ts",
        'const authored = "🌱";',
      ),
    ).toEqual([]);
  });
});
