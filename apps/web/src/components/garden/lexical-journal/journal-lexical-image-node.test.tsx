import { createEditor, $getRoot } from "lexical";
import type { JSX } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  $createOverGardenImageNode,
  OverGardenImageNode,
} from "./journal-lexical-nodes";
import { JournalImagePreviewProvider } from "./journal-lexical-image-node";

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
            getState: () => undefined,
            labels: {
              processing: "Processing",
              failed: "Photo failed",
              retry: "Retry photo",
              replace: "Replace photo",
              remove: "Remove",
              setCover: "Use as cover",
            },
            onRemove: vi.fn(),
            onRetry: vi.fn(),
            onReplace: vi.fn(),
            onSetCover: vi.fn(),
          }}
        >
          {decorated}
        </JournalImagePreviewProvider>,
      );
    });

    expect(
      renderer!.root.findAllByType("button").every((button) => button.props.disabled),
    ).toBe(true);
    await act(async () => renderer!.unmount());
  });

  it("keeps failed media recoverable with retry, replace, remove, and cover actions", async () => {
    const editor = createEditor({
      namespace: "journal-failed-image",
      nodes: [OverGardenImageNode],
    });
    let decorated: JSX.Element | null = null;
    editor.update(
      () => {
        const image = $createOverGardenImageNode({
          blockId: "image-failed",
          mediaAssetId: "00000000-0000-4000-8000-000000000002",
        });
        $getRoot().clear().append(image);
        decorated = image.decorate();
      },
      { discrete: true },
    );
    const onRetry = vi.fn();
    const onSetCover = vi.fn();

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <JournalImagePreviewProvider
          value={{
            disabled: false,
            getState: () => ({
              status: "failed",
              previewUrl: "blob:exact-final-webp",
              failureCode: "encode_timeout",
            }),
            labels: {
              processing: "Processing",
              failed: "Photo failed",
              retry: "Retry photo",
              replace: "Replace photo",
              remove: "Remove photo",
              setCover: "Use as cover",
            },
            onRemove: vi.fn(),
            onRetry,
            onReplace: vi.fn(),
            onSetCover,
          }}
        >
          {decorated}
        </JournalImagePreviewProvider>,
      );
    });

    expect(renderer!.root.findByProps({ role: "alert" }).children).toContain(
      "Photo failed",
    );
    const buttons = renderer!.root.findAllByType("button");
    expect(buttons.map((button) => button.children.join(""))).toEqual(
      expect.arrayContaining(["Retry photo", "Replace photo", "Remove photo", "Use as cover"]),
    );
    await act(async () => buttons.find((button) => button.children.join("") === "Retry photo")!.props.onClick());
    await act(async () => buttons.find((button) => button.children.join("") === "Use as cover")!.props.onClick());
    expect(onRetry).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000002",
    );
    expect(onSetCover).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000002",
    );
    await act(async () => renderer!.unmount());
  });

  it("keeps Remove failed photo enabled while a frozen publish wait unwinds", async () => {
    const editor = createEditor({
      namespace: "journal-failed-frozen-image",
      nodes: [OverGardenImageNode],
    });
    let decorated: JSX.Element | null = null;
    editor.update(
      () => {
        const image = $createOverGardenImageNode({
          blockId: "image-failed-frozen",
          mediaAssetId: "00000000-0000-4000-8000-000000000003",
        });
        $getRoot().clear().append(image);
        decorated = image.decorate();
      },
      { discrete: true },
    );
    const onRemove = vi.fn();
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <JournalImagePreviewProvider
          value={{
            disabled: true,
            getState: () => ({
              status: "failed",
              previewUrl: null,
              failureCode: "staging_upload_timeout",
            }),
            labels: {
              processing: "Processing",
              failed: "Photo failed",
              retry: "Retry photo",
              replace: "Replace photo",
              remove: "Remove failed photo",
              setCover: "Use as cover",
            },
            onRemove,
            onRetry: vi.fn(),
            onReplace: vi.fn(),
            onSetCover: vi.fn(),
          }}
        >
          {decorated}
        </JournalImagePreviewProvider>,
      );
    });

    const remove = renderer!.root
      .findAllByType("button")
      .find((button) => button.children.join("") === "Remove failed photo")!;
    expect(remove.props.disabled).toBe(false);
    await act(async () => remove.props.onClick());
    expect(onRemove).toHaveBeenCalledWith(
      "image-failed-frozen",
      "00000000-0000-4000-8000-000000000003",
    );
    await act(async () => renderer!.unmount());
  });
});
