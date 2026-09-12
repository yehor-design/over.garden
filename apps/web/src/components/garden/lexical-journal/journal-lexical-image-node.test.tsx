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

  /**
   * The caption is the one sentence that describes a photo (OVE-432): it is the
   * `figcaption` a reader sees and the `alt` a screen reader and an image
   * crawler are given. It has to be reachable by keyboard and hold what the
   * gardener typed without the editor eating it — proven in a real browser on
   * 2026-09-12, and pinned here.
   */
  it("offers a caption field a keyboard reaches, carrying what was typed", async () => {
    const editor = createEditor({
      namespace: "journal-image-caption",
      nodes: [OverGardenImageNode],
    });
    let decorated: JSX.Element | null = null;
    editor.update(
      () => {
        const image = $createOverGardenImageNode({
          blockId: "image-captioned",
          mediaAssetId: "00000000-0000-4000-8000-000000000002",
          caption: "Перша китиця після спеки",
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
            disabled: false,
            getState: () => ({
              status: "ready" as const,
              previewUrl: "blob:local/preview",
              failureCode: null,
            }),
            labels: {
              processing: "Processing",
              failed: "Photo failed",
              retry: "Retry photo",
              replace: "Replace photo",
              remove: "Remove",
              setCover: "Use as cover",
              caption: "Photo caption",
              captionPlaceholder: "What the photo shows",
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

    // The photo's own `alt` is the caption too — the editor shows the author
    // what the published page will say about the picture.
    expect(renderer!.root.findByType("img").props.alt).toBe(
      "Перша китиця після спеки",
    );

    const field = renderer!.root.findByType("textarea");
    expect(field.props.defaultValue).toBe("Перша китиця після спеки");
    expect(field.props.maxLength).toBe(280);
    // Not `name`d: the caption travels inside the serialised document, and a
    // second copy in the form post would be a second place to read it from.
    expect(field.props.name).toBeUndefined();
    await act(async () => renderer!.unmount());
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
              caption: "Photo caption",
              captionPlaceholder: "What the photo shows",
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
      renderer!.root
        .findAllByType("button")
        .every((button) => button.props.disabled),
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
              caption: "Photo caption",
              captionPlaceholder: "What the photo shows",
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
      expect.arrayContaining([
        "Retry photo",
        "Replace photo",
        "Remove photo",
        "Use as cover",
      ]),
    );
    await act(async () =>
      buttons
        .find((button) => button.children.join("") === "Retry photo")!
        .props.onClick(),
    );
    await act(async () =>
      buttons
        .find((button) => button.children.join("") === "Use as cover")!
        .props.onClick(),
    );
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
              caption: "Photo caption",
              captionPlaceholder: "What the photo shows",
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
