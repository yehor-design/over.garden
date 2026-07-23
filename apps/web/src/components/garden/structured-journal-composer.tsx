"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type EditorJS from "@editorjs/editorjs";
import type { OutputData } from "@editorjs/editorjs";

import { JournalDocumentRenderer } from "@/components/garden/journal-document-renderer";
import {
  attachJournalBlockReorderController,
  type JournalBlockReorderController,
} from "@/components/garden/journal-block-reorder-controller";
import type { JournalBlockReorderCopy } from "@/components/garden/journal-block-reorder";
import { OverGardenImageTool } from "@/components/garden/overgarden-image-tool";
import {
  editorOutputToJournalDocumentV1,
  journalDocumentV1ToEditorOutput,
} from "@/lib/garden/journal-document-editor-adapter";
import {
  compareMeaningfulBlockIds,
  createEmptyJournalDocument,
  semanticJournalDocumentHash,
  type JournalDocumentV1,
} from "@/lib/garden/journal-document";
import type { PublicLocale } from "@/lib/public-localization";
import { cn } from "@/lib/utils";

export interface StructuredJournalComposerLabels {
  loading: string;
  failureTitle: string;
  failureBody: string;
  retry: string;
  silentLoss: string;
  imageChoose: string;
  imageUploading: string;
  imageRemove: string;
  imageRejectRemote: string;
  unavailableTitle: string;
  unavailableBody: string;
  titleLabel: string;
  dateLabel: string;
  saveLabel: string;
  tools: {
    paragraph: string;
    header: string;
    list: string;
    quote: string;
    delimiter: string;
    image: string;
    bold: string;
    italic: string;
    link: string;
  };
  reorder: JournalBlockReorderCopy;
}

export interface StructuredJournalComposerProps {
  locale: PublicLocale;
  labels: StructuredJournalComposerLabels;
  initialDocument?: JournalDocumentV1 | null;
  imagePreviewUrls?: ReadonlyMap<string, string>;
  disabled?: boolean;
  className?: string;
  onDocumentChange: (
    document: JournalDocumentV1,
    meta: {
      generation: number;
      hash: string;
    },
  ) => void;
  onSelectImageFile: (
    file: File,
    blockId: string,
  ) => Promise<{
    mediaAssetId?: string;
    previewUrl: string;
  }>;
  onRemoveImageBlock?: (blockId: string) => void;
  composerRef?: MutableRefObject<StructuredJournalComposerHandle | null>;
}

export interface StructuredJournalComposerHandle {
  flushLatest: () => Promise<JournalDocumentV1 | null>;
  getGeneration: () => number;
  isComposing: () => boolean;
  isReordering: () => boolean;
  moveBlock: (fromIndex: number, toIndex: number) => Promise<void>;
  moveBlockById: (
    sourceBlockId: string,
    delta: -1 | 1,
  ) => Promise<"moved" | "noop">;
  insertVoiceTranscript: (transcript: string) => Promise<void>;
  focus: () => void;
}

export function StructuredJournalComposer(props: StructuredJournalComposerProps) {
  return <StructuredJournalComposerInner {...props} />;
}

function StructuredJournalComposerInner({
  locale,
  labels,
  initialDocument,
  imagePreviewUrls,
  disabled = false,
  className,
  onDocumentChange,
  onSelectImageFile,
  onRemoveImageBlock,
  composerRef,
}: StructuredJournalComposerProps) {
  const holderId = useId().replace(/:/g, "");
  const liveRegionId = `${holderId}-reorder-live`;
  const editorRef = useRef<EditorJS | null>(null);
  const reorderControllerRef = useRef<JournalBlockReorderController | null>(
    null,
  );
  const generationRef = useRef(0);
  const composingRef = useRef(false);
  const latestDocumentRef = useRef<JournalDocumentV1>(
    initialDocument ?? createEmptyJournalDocument(),
  );
  const propsRef = useRef({
    onDocumentChange,
    onSelectImageFile,
    onRemoveImageBlock,
    labels,
    imagePreviewUrls,
    disabled,
  });
  const serializeGenerationRef = useRef<
    (editor: EditorJS | null) => Promise<JournalDocumentV1 | null>
  >(async () => latestDocumentRef.current);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [fallbackDocument, setFallbackDocument] = useState<JournalDocumentV1 | null>(
    initialDocument ?? null,
  );
  const [announcement, setAnnouncement] = useState("");
  const mountedRef = useRef(true);

  useEffect(() => {
    propsRef.current = {
      onDocumentChange,
      onSelectImageFile,
      onRemoveImageBlock,
      labels,
      imagePreviewUrls,
      disabled,
    };
  }, [
    onDocumentChange,
    onSelectImageFile,
    onRemoveImageBlock,
    labels,
    imagePreviewUrls,
    disabled,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    let editor: EditorJS | null = null;
    let cancelled = false;
    let compositionCleanup: (() => void) | null = null;
    let reorderCleanup: (() => void) | null = null;

    async function serializeGeneration(activeEditor: EditorJS | null) {
      if (!activeEditor) return latestDocumentRef.current;
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      const saved = await activeEditor.save();
      if (generation !== generationRef.current) {
        return latestDocumentRef.current;
      }

      const liveIds = collectLiveMeaningfulBlockIds(activeEditor);
      let document: JournalDocumentV1;
      try {
        document = editorOutputToJournalDocumentV1(saved, {
          retainEmptyShells: true,
        });
      } catch {
        setStatus("failed");
        return latestDocumentRef.current;
      }

      const comparison = compareMeaningfulBlockIds(liveIds, document);
      if (!comparison.ok) {
        setStatus("failed");
        setFallbackDocument(latestDocumentRef.current);
        return latestDocumentRef.current;
      }

      latestDocumentRef.current = document;
      propsRef.current.onDocumentChange(document, {
        generation,
        hash: semanticJournalDocumentHash(document),
      });
      reorderControllerRef.current?.sync();
      return document;
    }

    serializeGenerationRef.current = serializeGeneration;

    async function boot() {
      try {
        const [
          { default: EditorJSCtor },
          { default: Header },
          { default: EditorjsList },
          { default: Quote },
          { default: Delimiter },
        ] = await Promise.all([
          import("@editorjs/editorjs"),
          import("@editorjs/header"),
          import("@editorjs/list"),
          import("@editorjs/quote"),
          import("@editorjs/delimiter"),
        ]);

        if (cancelled || !mountedRef.current) return;

        const currentLabels = propsRef.current.labels;
        const initial = journalDocumentV1ToEditorOutput(
          initialDocument ?? createEmptyJournalDocument(),
          {
            get: (mediaAssetId) =>
              propsRef.current.imagePreviewUrls?.get(mediaAssetId),
          },
        );

        editor = new EditorJSCtor({
          holder: holderId,
          autofocus: !disabled,
          readOnly: disabled,
          data: initial as OutputData,
          i18n: {
            messages: {
              toolNames: {
                Text: currentLabels.tools.paragraph,
                Heading: currentLabels.tools.header,
                List: currentLabels.tools.list,
                Quote: currentLabels.tools.quote,
                Delimiter: currentLabels.tools.delimiter,
                Image: currentLabels.tools.image,
                Bold: currentLabels.tools.bold,
                Italic: currentLabels.tools.italic,
                Link: currentLabels.tools.link,
              },
              blockTunes: {
                delete: {
                  Delete: currentLabels.reorder.deleteBlock,
                },
                moveUp: {
                  "Move up": currentLabels.reorder.moveUp,
                },
                moveDown: {
                  "Move down": currentLabels.reorder.moveDown,
                },
              },
            },
          },
          tools: {
            header: {
              class: Header,
              config: { levels: [2, 3], defaultLevel: 2 },
              inlineToolbar: ["bold", "italic", "link"],
            },
            list: {
              class: EditorjsList,
              inlineToolbar: ["bold", "italic", "link"],
              config: {
                defaultStyle: "unordered",
              },
            },
            quote: {
              class: Quote,
              inlineToolbar: ["bold", "italic", "link"],
              config: {
                quotePlaceholder: currentLabels.tools.quote,
                captionPlaceholder: "",
              },
            },
            delimiter: Delimiter,
            image: {
              class: OverGardenImageTool,
              config: {
                labels: {
                  choose: currentLabels.imageChoose,
                  uploading: currentLabels.imageUploading,
                  remove: currentLabels.imageRemove,
                  rejectRemote: currentLabels.imageRejectRemote,
                },
                getInlineImageCount: () =>
                  latestDocumentRef.current.blocks.filter(
                    (block) => block.type === "image",
                  ).length,
                onSelectFile: async (file: File) => {
                  const blockId = crypto.randomUUID()
                    .replace(/-/g, "")
                    .slice(0, 16);
                  const result = await propsRef.current.onSelectImageFile(
                    file,
                    blockId,
                  );
                  return { ...result, blockId };
                },
                onRemove: (blockId: string) =>
                  propsRef.current.onRemoveImageBlock?.(blockId),
              },
            },
          },
          onChange: async () => {
            if (composingRef.current) return;
            if (reorderControllerRef.current?.isReordering()) return;
            await serializeGeneration(editor);
          },
        });

        await editor.isReady;
        if (cancelled || !mountedRef.current) {
          editor.destroy();
          return;
        }
        editorRef.current = editor;

        const holder = document.getElementById(holderId);
        if (holder) {
          const onStart = () => {
            composingRef.current = true;
          };
          const onEnd = () => {
            composingRef.current = false;
            void serializeGeneration(editorRef.current);
          };
          holder.addEventListener("compositionstart", onStart);
          holder.addEventListener("compositionend", onEnd);
          compositionCleanup = () => {
            holder.removeEventListener("compositionstart", onStart);
            holder.removeEventListener("compositionend", onEnd);
          };

          const controller = attachJournalBlockReorderController({
            editor,
            holder,
            disabled: propsRef.current.disabled,
            getCopy: () => propsRef.current.labels.reorder,
            onCommittedMove: async () => {
              await serializeGeneration(editorRef.current);
            },
            onAnnouncement: (message) => {
              if (!mountedRef.current) return;
              setAnnouncement("");
              // Force a new live-region utterance even for identical copy.
              window.setTimeout(() => {
                if (mountedRef.current) setAnnouncement(message);
              }, 0);
            },
          });
          reorderControllerRef.current = controller;
          reorderCleanup = () => {
            controller.destroy();
            reorderControllerRef.current = null;
          };
        }

        setStatus("ready");
      } catch {
        if (!cancelled && mountedRef.current) {
          setStatus("failed");
          setFallbackDocument(
            latestDocumentRef.current ??
              initialDocument ??
              createEmptyJournalDocument(),
          );
        }
      }
    }

    void boot();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      compositionCleanup?.();
      reorderCleanup?.();
      const current = editorRef.current;
      editorRef.current = null;
      if (current) {
        void current.isReady.then(() => current.destroy()).catch(() => undefined);
      }
    };
    // Mount-once editor; later prop updates flow through propsRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holderId]);

  useEffect(() => {
    if (!composerRef) return;
    composerRef.current = {
      flushLatest: async () => {
        const editor = editorRef.current;
        if (!editor) return latestDocumentRef.current;
        while (
          composingRef.current ||
          reorderControllerRef.current?.isReordering()
        ) {
          await new Promise((resolve) => setTimeout(resolve, 16));
        }
        return serializeGenerationRef.current(editor);
      },
      getGeneration: () => generationRef.current,
      isComposing: () => composingRef.current,
      isReordering: () =>
        Boolean(reorderControllerRef.current?.isReordering()),
      moveBlock: async (fromIndex, toIndex) => {
        const editor = editorRef.current;
        if (!editor) return;
        if (fromIndex === toIndex) return;
        editor.blocks.move(toIndex, fromIndex);
        await serializeGenerationRef.current(editor);
        reorderControllerRef.current?.sync();
      },
      moveBlockById: async (sourceBlockId, delta) => {
        const controller = reorderControllerRef.current;
        if (!controller) return "noop";
        return controller.moveBlockById(sourceBlockId, delta);
      },
      insertVoiceTranscript: async (transcript) => {
        const editor = editorRef.current;
        if (!editor || !transcript.trim()) return;
        const index = editor.blocks.getCurrentBlockIndex();
        await editor.blocks.insert(
          "paragraph",
          { text: transcript },
          undefined,
          index >= 0 ? index + 1 : undefined,
          true,
        );
        await serializeGenerationRef.current(editor);
        reorderControllerRef.current?.sync();
      },
      focus: () => {
        editorRef.current?.focus(true);
      },
    };
    return () => {
      if (composerRef) composerRef.current = null;
    };
  }, [composerRef]);

  if (status === "failed") {
    return (
      <div
        className={cn("grid gap-3 rounded-md border border-border p-3", className)}
        data-structured-journal-composer="failed"
        lang={locale}
      >
        <div className="grid gap-1">
          <p className="font-medium">{labels.failureTitle}</p>
          <p className="text-sm text-muted-foreground">{labels.failureBody}</p>
        </div>
        <JournalDocumentRenderer
          document={fallbackDocument}
          copy={{
            unavailableTitle: labels.unavailableTitle,
            unavailableBody: labels.unavailableBody,
          }}
        />
        <button
          type="button"
          className="justify-self-start text-sm underline"
          onClick={() => window.location.reload()}
        >
          {labels.retry}
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "structured-journal-composer font-sans [&_.ce-block]:font-sans",
        className,
      )}
      data-structured-journal-composer="true"
      data-status={status}
      data-reorder-ready={status === "ready" ? "true" : "false"}
      lang={locale}
    >
      {status === "loading" ? (
        <p className="text-sm text-muted-foreground">{labels.loading}</p>
      ) : null}
      <div id={holderId} className="min-h-40" />
      <div
        id={liveRegionId}
        className="og-reorder-live-region"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-og-reorder-live-region="true"
      >
        {announcement}
      </div>
    </div>
  );
}

function collectLiveMeaningfulBlockIds(editor: EditorJS): string[] {
  const count = editor.blocks.getBlocksCount();
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const block = editor.blocks.getBlockByIndex(i);
    if (!block?.id) continue;
    ids.push(block.id);
  }
  return ids;
}
