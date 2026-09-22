import { createEditor, $getRoot } from "lexical";
import type { JSX } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  $createOverGardenImageNode,
  OverGardenImageNode,
} from "./journal-lexical-nodes";
import {
  JournalImagePreviewProvider,
  journalImageName,
  type JournalImagePreviewContextValue,
} from "./journal-lexical-image-node";

const editorUpdate = vi.fn();
vi.mock("@lexical/react/LexicalComposerContext", () => ({
  useLexicalComposerContext: () => [
    { update: editorUpdate, getRootElement: () => null },
  ],
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
              phase: {
                decoding: "Reading the photo",
                encoding: "Preparing the variants",
                staging: "Uploading",
              },
              failureReason: {
                retry_limit_exceeded: "Three attempts failed.",
                fallback: "Try again or choose another file.",
              },
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
              phase: {
                decoding: "Reading the photo",
                encoding: "Preparing the variants",
                staging: "Uploading",
              },
              failureReason: {
                retry_limit_exceeded: "Three attempts failed.",
                fallback: "Try again or choose another file.",
              },
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
              phase: {
                decoding: "Reading the photo",
                encoding: "Preparing the variants",
                staging: "Uploading",
              },
              failureReason: {
                retry_limit_exceeded: "Three attempts failed.",
                fallback: "Try again or choose another file.",
              },
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
      "Try again or choose another file.",
    );
    const buttons = renderer!.root.findAllByType("button");
    const byAction = (action: string) =>
      buttons.find(
        (button) => button.props["data-journal-image-action"] === action,
      )!;
    expect(
      ["retry", "replace", "remove", "cover"].map(
        (action) => byAction(action).props["aria-label"],
      ),
    ).toEqual([
      "Retry photo: 1",
      "Replace photo: 1",
      "Remove photo: 1",
      "Use as cover: 1",
    ]);
    await act(async () => byAction("retry").props.onClick());
    await act(async () => byAction("cover").props.onClick());
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
              phase: {
                decoding: "Reading the photo",
                encoding: "Preparing the variants",
                staging: "Uploading",
              },
              failureReason: {
                retry_limit_exceeded: "Three attempts failed.",
                fallback: "Try again or choose another file.",
              },
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
      .find(
        (button) => button.props["data-journal-image-action"] === "remove",
      )!;
    expect(remove.props.disabled).toBe(false);
    await act(async () => remove.props.onClick());
    expect(onRemove).toHaveBeenCalledWith(
      "image-failed-frozen",
      "00000000-0000-4000-8000-000000000003",
    );
    await act(async () => renderer!.unmount());
  });

  /**
   * `OVE-487` criterion 4: a remove button named "Remove" leaves a
   * screen-reader user guessing which of five photographs goes. Every control
   * says which one it acts on — by position, and by the start of the caption
   * the gardener wrote.
   */
  it("names every control with the photograph it acts on, and keeps moves inside the story", async () => {
    const editor = createEditor({
      namespace: "journal-named-image",
      nodes: [OverGardenImageNode],
    });
    let decorated: JSX.Element | null = null;
    editor.update(
      () => {
        const image = $createOverGardenImageNode({
          blockId: "image-second",
          mediaAssetId: "00000000-0000-4000-8000-000000000012",
          caption: "Жовті плями на нижньому листі після зливи",
        });
        $getRoot().clear().append(image);
        decorated = image.decorate();
      },
      { discrete: true },
    );
    const value: JournalImagePreviewContextValue = {
      disabled: false,
      imageOrder: [
        "00000000-0000-4000-8000-000000000011",
        "00000000-0000-4000-8000-000000000012",
      ],
      // The photograph is the story's last block: it can go up, not down.
      blockOrder: ["paragraph-1", "image-first", "image-second"],
      coverMediaAssetId: "00000000-0000-4000-8000-000000000012",
      getState: () => ({
        status: "ready",
        previewUrl: "blob:exact-final-webp",
        failureCode: null,
        source: "staged",
      }),
      labels: {
        processing: "Обробка фото…",
        phase: {
          decoding: "Читаємо фото на пристрої…",
          encoding: "Стискаємо у WebP на пристрої…",
          staging: "Надсилаємо в тимчасове сховище…",
        },
        failureReason: { fallback: "Спробуйте ще раз." },
        failed: "Фото не вдалося підготувати.",
        retry: "Повторити",
        replace: "Замінити",
        remove: "Прибрати",
        setCover: "Обкладинка",
        caption: "Опис фото",
        captionPlaceholder: "Що видно на фото",
        name: "Фото {index}",
        actionName: "{action}: {photo}",
        moveUp: "Вище",
        moveDown: "Нижче",
        ready: "Готове. З’явиться разом із записом після публікації.",
        moved: "{type} переміщено на позицію {position} з {total}",
      },
      onRemove: vi.fn(),
      onRetry: vi.fn(),
      onReplace: vi.fn(),
      onSetCover: vi.fn(),
    };
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <JournalImagePreviewProvider value={value}>
          {decorated}
        </JournalImagePreviewProvider>,
      );
    });
    const buttons = renderer!.root.findAllByType("button");
    const byAction = (action: string) =>
      buttons.find(
        (button) => button.props["data-journal-image-action"] === action,
      )!;
    expect(byAction("remove").props["aria-label"]).toBe(
      "Прибрати: Фото 2 — Жовті плями на нижньому листі після зливи",
    );
    // Its cover state is a value, said with `aria-pressed`, not a colour.
    expect(byAction("cover").props["aria-pressed"]).toBe(true);
    expect(byAction("move-up").props.disabled).toBe(false);
    expect(byAction("move-down").props.disabled).toBe(true);
    // Ready to publish, never "uploaded": nothing is public before Publish.
    expect(
      renderer!.root.findByProps({ "data-journal-image-ready": "true" })
        .children,
    ).toEqual(["Готове. З’явиться разом із записом після публікації."]);

    editorUpdate.mockClear();
    await act(async () => byAction("move-up").props.onClick());
    expect(editorUpdate).toHaveBeenCalledTimes(1);
    await act(async () => renderer!.unmount());
  });

  it("says nothing about publishing for a photograph that already is published", async () => {
    const editor = createEditor({
      namespace: "journal-existing-image",
      nodes: [OverGardenImageNode],
    });
    let decorated: JSX.Element | null = null;
    editor.update(
      () => {
        const image = $createOverGardenImageNode({
          blockId: "image-existing",
          mediaAssetId: "00000000-0000-4000-8000-000000000021",
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
            imageOrder: ["00000000-0000-4000-8000-000000000021"],
            blockOrder: ["image-existing"],
            getState: () => ({
              status: "ready",
              previewUrl: "https://media.over.garden/existing.webp",
              failureCode: null,
              source: "existing",
            }),
            labels: {
              processing: "Processing",
              phase: {
                decoding: "Reading",
                encoding: "Encoding",
                staging: "Staging",
              },
              failureReason: { fallback: "Try again." },
              failed: "Failed",
              retry: "Retry",
              replace: "Replace",
              remove: "Remove",
              setCover: "Cover",
              caption: "Caption",
              captionPlaceholder: "What it shows",
              ready: "Ready to publish",
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
      renderer!.root.findAllByProps({ "data-journal-image-ready": "true" }),
    ).toHaveLength(0);
    await act(async () => renderer!.unmount());
  });

  it("names a photograph by position and the start of its caption", () => {
    expect(journalImageName("Фото {index}", 3, "")).toBe("Фото 3");
    expect(journalImageName("Снимка {index}", 1, "  Листа   с петна ")).toBe(
      "Снимка 1 — Листа с петна",
    );
    const long = "а".repeat(80);
    expect(journalImageName("Фото {index}", 2, long)).toBe(
      `Фото 2 — ${"а".repeat(47)}…`,
    );
  });
});
