"use client";

import type { API, BlockTool, BlockToolConstructorOptions } from "@editorjs/editorjs";

import {
  COMPOSER_PHOTO_ACCEPT,
  composerPhotoSelectionError,
} from "@/lib/garden/composer-photo-selection";
import { MAX_JOURNAL_INLINE_IMAGES } from "@/lib/garden/journal-document";

export interface OverGardenImageToolData {
  mediaAssetId?: string;
  file?: {
    mediaAssetId?: string;
    url?: string;
  };
  caption?: string;
}

export interface OverGardenImageToolConfig {
  onSelectFile: (file: File) => Promise<{
    mediaAssetId?: string;
    previewUrl: string;
    blockId: string;
  }>;
  onRemove?: (blockId: string) => void;
  labels: {
    choose: string;
    uploading: string;
    remove: string;
    rejectRemote: string;
  };
  getInlineImageCount: () => number;
}

/**
 * First-party Editor.js image tool.
 * Accepts device File / clipboard File / drag-and-drop File only.
 * Never fetches remote URLs or pastes HTML images.
 */
export class OverGardenImageTool implements BlockTool {
  static get isReadOnlySupported() {
    return true;
  }

  static get pasteConfig() {
    return {
      files: {
        mimeTypes: ["image/jpeg", "image/png", "image/webp"],
      },
      // Explicitly omit tags/patterns that would ingest remote <img> or URLs.
    };
  }

  static get toolbox() {
    return {
      title: "Image",
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
    };
  }

  private api: API;
  private config: OverGardenImageToolConfig;
  private data: OverGardenImageToolData;
  private wrapper: HTMLElement | null = null;
  private readOnly: boolean;
  private blockId: string;

  constructor({
    api,
    config,
    data,
    readOnly,
    block,
  }: BlockToolConstructorOptions<OverGardenImageToolData, OverGardenImageToolConfig>) {
    this.api = api;
    this.config = config ?? {
      onSelectFile: async () => {
        throw new Error("Image tool is not configured.");
      },
      labels: {
        choose: "Image",
        uploading: "Uploading",
        remove: "Remove",
        rejectRemote: "Remote images are not allowed.",
      },
      getInlineImageCount: () => 0,
    };
    this.data = data ?? {};
    this.readOnly = Boolean(readOnly);
    this.blockId = block?.id ?? `image-${crypto.randomUUID()}`;
  }

  render() {
    this.wrapper = document.createElement("div");
    this.wrapper.className = "og-editor-image";
    this.wrapper.dataset.blockId = this.blockId;
    this.renderContents();
    return this.wrapper;
  }

  save(): OverGardenImageToolData {
    const mediaAssetId =
      this.data.mediaAssetId ?? this.data.file?.mediaAssetId ?? undefined;
    return {
      mediaAssetId,
      file: mediaAssetId
        ? {
            mediaAssetId,
            ...(this.data.file?.url ? { url: this.data.file.url } : {}),
          }
        : undefined,
    };
  }

  validate(saved: OverGardenImageToolData) {
    return Boolean(saved.mediaAssetId ?? saved.file?.mediaAssetId);
  }

  async onPaste(event: CustomEvent) {
    const detail = event.detail as {
      type?: string;
      file?: File;
      data?: { src?: string };
    };
    if (detail.type === "file" && detail.file) {
      await this.acceptFile(detail.file);
      return;
    }
    // Remote URL / HTML image paste: reject with zero network.
    this.api.notifier.show({
      message: this.config.labels.rejectRemote,
      style: "error",
    });
  }

  destroyed() {
    this.config.onRemove?.(this.blockId);
  }

  private renderContents() {
    if (!this.wrapper) return;
    this.wrapper.replaceChildren();

    const url = this.data.file?.url;
    if (url) {
      const figure = document.createElement("figure");
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      img.className = "og-editor-image__preview";
      figure.append(img);
      if (!this.readOnly) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "og-editor-image__remove";
        remove.textContent = this.config.labels.remove;
        remove.addEventListener("click", () => {
          this.api.blocks.delete();
        });
        figure.append(remove);
      }
      this.wrapper.append(figure);
      return;
    }

    if (this.readOnly) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "og-editor-image__choose";
    button.textContent = this.config.labels.choose;
    button.addEventListener("click", () => this.openFilePicker());
    this.wrapper.append(button);

    this.wrapper.addEventListener("dragover", (event) => {
      event.preventDefault();
    });
    this.wrapper.addEventListener("drop", (event) => {
      event.preventDefault();
      const file = event.dataTransfer?.files?.[0];
      if (file) void this.acceptFile(file);
    });
  }

  private openFilePicker() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = COMPOSER_PHOTO_ACCEPT;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) void this.acceptFile(file);
    });
    input.click();
  }

  private async acceptFile(file: File) {
    const selectionError = composerPhotoSelectionError(file);
    if (selectionError) {
      this.api.notifier.show({ message: selectionError, style: "error" });
      return;
    }
    if (this.config.getInlineImageCount() >= MAX_JOURNAL_INLINE_IMAGES) {
      this.api.notifier.show({
        message: this.config.labels.rejectRemote,
        style: "error",
      });
      return;
    }

    if (this.wrapper) {
      this.wrapper.textContent = this.config.labels.uploading;
    }

    try {
      const result = await this.config.onSelectFile(file);
      this.blockId = result.blockId || this.blockId;
      this.data = {
        mediaAssetId: result.mediaAssetId,
        file: {
          mediaAssetId: result.mediaAssetId,
          url: result.previewUrl,
        },
      };
      this.renderContents();
    } catch (error) {
      this.api.notifier.show({
        message: error instanceof Error ? error.message : "Upload failed.",
        style: "error",
      });
      this.renderContents();
    }
  }
}
