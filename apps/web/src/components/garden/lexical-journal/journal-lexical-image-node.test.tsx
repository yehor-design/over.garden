import { createEditor, $getRoot } from "lexical";
import type { JSX } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  $createOverGardenImageNode,
  JournalImagePreviewProvider,
  OverGardenImageNode,
} from "./journal-lexical-nodes";

vi.mock("@lexical/react/LexicalComposerContext", () => ({
  useLexicalComposerContext: () => [{ update: vi.fn() }],
}));

describe("OverGarden Lexical image controls", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not expose a mutable remove action while the composer is disabled", async () => {
    const editor = createEditor({
      namespace: "journal-disabled-image",
      nodes: [OverGardenImageNode],
    });
    let decorated: JSX.Element | null = null;
    editor.update(
      () => {
        const image = $createOverGardenImageNode({
          blockId: "image-domain",
          mediaAssetId: "00000000-0000-4000-8000-000000000001",
        });
        $getRoot().clear().append(image);
        decorated = image.decorate();
      },
      { discrete: true },
    );

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <JournalImagePreviewProvider
          value={{
            disabled: true,
            getPreviewUrl: () => undefined,
            removeLabel: "Remove",
            onRemove: vi.fn(),
          }}
        >
          {decorated}
        </JournalImagePreviewProvider>,
      );
    });

    expect(renderer!.root.findByType("button").props.disabled).toBe(true);
    await act(async () => renderer!.unmount());
  });
});
