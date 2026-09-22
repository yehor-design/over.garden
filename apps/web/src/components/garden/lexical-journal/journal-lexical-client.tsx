"use client";

import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $insertNodes,
  $isNodeSelection,
  $isParagraphNode,
  $isRangeSelection,
  type LexicalNode,
} from "lexical";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";

import { ephemeralStagingFailureCode } from "@/lib/media/ephemeral-staging-client";

import {
  $createOverGardenImageNode,
  $getJournalBlockId,
  $setJournalBlockId,
  createJournalBlockId,
  JournalImagePreviewProvider,
} from "./journal-lexical-nodes";
import { createJournalLexicalExtension } from "./journal-lexical-extensions";
import { JournalBlockGutter } from "./journal-block-gutter";
import { JournalPlaceholderPlugin } from "./journal-placeholder-plugin";
import { JournalFileDropPlugin } from "./journal-file-drop-plugin";
import { JournalSelectionToolbar } from "./journal-selection-toolbar";
import { JournalSlashMenu } from "./journal-slash-menu";
import { JournalComposerTools } from "./journal-composer-tools";
import {
  moveJournalBlockById,
  moveJournalBlockToIndex,
} from "./journal-block-order";
import { JournalSafePastePlugin } from "./journal-safe-paste-plugin";
import type {
  StructuredJournalComposerHandle,
  StructuredJournalComposerProps,
} from "@/components/garden/structured-journal-composer";
import { classifyComposerPhotoRefusal } from "@/lib/garden/composer-photo-selection";
import { waitForComposerIdle } from "@/lib/garden/composer-idle-deadline";
import {
  lexicalEditorStateToJournalDocumentV1,
  JOURNAL_HYDRATION_TAG,
} from "@/lib/garden/journal-document-lexical-adapter";
import {
  createEmptyJournalDocument,
  journalDocumentImageCount,
  listJournalDocumentImageMediaIds,
  MAX_JOURNAL_INLINE_IMAGES,
  normalizeJournalDocumentOrThrow,
  semanticJournalDocumentHash,
  type JournalDocumentV1,
} from "@/lib/garden/journal-document";
import { cn } from "@/lib/utils";

export interface JournalLexicalClientProps extends StructuredJournalComposerProps {
  onReady(): void;
  onDegraded(document: JournalDocumentV1): void;
}

type LifecycleState =
  | "loading"
  | "ready"
  | "composing"
  | "reordering"
  | "media_in_flight"
  | "serializing"
  | "destroyed";

class JournalDegradationBridge {
  private latestDocument: JournalDocumentV1;
  private callback: (document: JournalDocumentV1) => void;

  constructor(
    initialDocument: JournalDocumentV1,
    callback: (document: JournalDocumentV1) => void,
  ) {
    this.latestDocument = initialDocument;
    this.callback = callback;
  }

  updateCallback(callback: (document: JournalDocumentV1) => void) {
    this.callback = callback;
  }

  record(document: JournalDocumentV1) {
    this.latestDocument = document;
  }

  degrade() {
    this.callback(this.latestDocument);
  }
}

export function JournalLexicalClient(props: JournalLexicalClientProps) {
  const {
    coverMediaAssetId,
    imagePreviewUrls,
    imageStates,
    onRemoveImageBlock,
    onReplaceImage,
    onRetryImage,
    onSetImageAsCover,
  } = props;
  const [initialBinding] = useState(() =>
    normalizeJournalDocumentOrThrow(
      props.initialDocument ?? createEmptyJournalDocument(),
    ),
  );
  const [degradationBridge] = useState(
    () => new JournalDegradationBridge(initialBinding, props.onDegraded),
  );
  useEffect(() => {
    degradationBridge.updateCallback(props.onDegraded);
  }, [degradationBridge, props.onDegraded]);
  const [extension] = useState(() =>
    createJournalLexicalExtension({
      initialDocument: initialBinding,
      editable: !props.disabled,
      onError: () => {
        degradationBridge.degrade();
      },
    }),
  );
  const [localPreviewUrls, setLocalPreviewUrls] = useState<
    ReadonlyMap<string, string>
  >(() => new Map());
  const [localFailureCodes, setLocalFailureCodes] = useState<
    ReadonlyMap<string, string>
  >(() => new Map());
  const previewUrls = useMemo(() => {
    const next = new Map(imagePreviewUrls);
    for (const [mediaAssetId, previewUrl] of localPreviewUrls) {
      next.set(mediaAssetId, previewUrl);
    }
    return next;
  }, [imagePreviewUrls, localPreviewUrls]);
  const onPreviewResolved = useCallback(
    (mediaAssetId: string, previewUrl: string) => {
      setLocalPreviewUrls((current) => {
        const next = new Map(current);
        next.set(mediaAssetId, previewUrl);
        return next;
      });
    },
    [],
  );
  const onPreviewRemoved = useCallback((mediaAssetId: string) => {
    setLocalPreviewUrls((current) => {
      if (!current.has(mediaAssetId)) return current;
      const next = new Map(current);
      next.delete(mediaAssetId);
      return next;
    });
    setLocalFailureCodes((current) => {
      if (!current.has(mediaAssetId)) return current;
      const next = new Map(current);
      next.delete(mediaAssetId);
      return next;
    });
  }, []);
  const onPreviewFailed = useCallback(
    (mediaAssetId: string, failureCode: string) => {
      setLocalFailureCodes((current) => {
        const next = new Map(current);
        next.set(mediaAssetId, failureCode);
        return next;
      });
    },
    [],
  );
  // The photographs in reading order, so each block can be named by its
  // position — "Фото 2" — and know whether it can move up or down.
  const [imageOrder, setImageOrder] = useState<readonly string[]>(() =>
    listJournalDocumentImageMediaIds(initialBinding),
  );
  const [blockOrder, setBlockOrder] = useState<readonly string[]>(() =>
    initialBinding.blocks.map((block) => block.id),
  );
  const announceRef = useRef<((message: string) => void) | null>(null);
  const onLatestGoodDocument = useCallback(
    (document: JournalDocumentV1) => {
      degradationBridge.record(document);
      setImageOrder((current) =>
        sameIds(current, listJournalDocumentImageMediaIds(document)),
      );
      setBlockOrder((current) =>
        sameIds(
          current,
          document.blocks.map((block) => block.id),
        ),
      );
    },
    [degradationBridge],
  );
  const previewContext = useMemo(
    () => ({
      disabled: props.disabled ?? false,
      imageOrder,
      blockOrder,
      coverMediaAssetId: coverMediaAssetId ?? null,
      announce: (message: string) => announceRef.current?.(message),
      getState: (mediaAssetId: string) => {
        const localState = imageStates?.get(mediaAssetId);
        if (localState) return localState;
        const failureCode = localFailureCodes.get(mediaAssetId);
        if (failureCode) {
          return { status: "failed" as const, previewUrl: null, failureCode };
        }
        const previewUrl = previewUrls.get(mediaAssetId);
        return previewUrl
          ? { status: "ready" as const, previewUrl, failureCode: null }
          : undefined;
      },
      labels: {
        processing: props.labels.imageUploading,
        phase: props.labels.imagePhase,
        failureReason: props.labels.imageFailureReason,
        failed: props.labels.imageFailed,
        retry: props.labels.imageRetry,
        replace: props.labels.imageReplace,
        remove: props.labels.imageRemove,
        setCover: props.labels.imageSetCover,
        caption: props.labels.imageCaption,
        captionPlaceholder: props.labels.imageCaptionPlaceholder,
        name: props.labels.imageName,
        actionName: props.labels.imageActionName,
        moveUp: props.labels.imageMoveUp,
        moveDown: props.labels.imageMoveDown,
        ready: props.labels.imageReady,
        moved: props.labels.reorder.movedAnnouncement,
      },
      onRemove: (blockId: string, mediaAssetId: string) => {
        onPreviewRemoved(mediaAssetId);
        onRemoveImageBlock?.(blockId, mediaAssetId);
      },
      onRetry: (mediaAssetId: string) => onRetryImage?.(mediaAssetId),
      onReplace: (mediaAssetId: string, file: File) =>
        onReplaceImage?.(mediaAssetId, file),
      onSetCover: (mediaAssetId: string) => onSetImageAsCover?.(mediaAssetId),
    }),
    [
      blockOrder,
      coverMediaAssetId,
      imageOrder,
      imageStates,
      localFailureCodes,
      onPreviewRemoved,
      onRemoveImageBlock,
      onReplaceImage,
      onRetryImage,
      onSetImageAsCover,
      previewUrls,
      props.disabled,
      props.labels.imageFailed,
      props.labels.imageFailureReason,
      props.labels.imagePhase,
      props.labels.imageRemove,
      props.labels.imageReplace,
      props.labels.imageRetry,
      props.labels.imageSetCover,
      props.labels.imageCaption,
      props.labels.imageCaptionPlaceholder,
      props.labels.imageUploading,
      props.labels.imageName,
      props.labels.imageActionName,
      props.labels.imageMoveUp,
      props.labels.imageMoveDown,
      props.labels.imageReady,
      props.labels.reorder.movedAnnouncement,
    ],
  );

  return (
    <JournalImagePreviewProvider value={previewContext}>
      <LexicalExtensionComposer extension={extension} contentEditable={null}>
        <JournalLexicalClientBody
          {...props}
          initialDocument={initialBinding}
          onPreviewResolved={onPreviewResolved}
          onPreviewFailed={onPreviewFailed}
          onLatestGoodDocument={onLatestGoodDocument}
          announceRef={announceRef}
        />
      </LexicalExtensionComposer>
    </JournalImagePreviewProvider>
  );
}

interface JournalLexicalClientBodyProps extends JournalLexicalClientProps {
  onPreviewResolved(mediaAssetId: string, previewUrl: string): void;
  onPreviewFailed(mediaAssetId: string, failureCode: string): void;
  onLatestGoodDocument(document: JournalDocumentV1): void;
  announceRef: MutableRefObject<((message: string) => void) | null>;
}

function JournalLexicalClientBody({
  locale,
  labels,
  initialDocument,
  disabled = false,
  className,
  onDocumentChange,
  onSelectImageFile,
  composerRef,
  onReady,
  onDegraded,
  onPreviewResolved,
  onPreviewFailed,
  onLatestGoodDocument,
  announceRef,
  imageInsertionMode = "after-ready",
}: JournalLexicalClientBodyProps) {
  const [editor] = useLexicalComposerContext();
  const normalizedInitial = initialDocument ?? createEmptyJournalDocument();
  const latestDocumentRef = useRef(normalizedInitial);
  const latestHashRef = useRef(semanticJournalDocumentHash(normalizedInitial));
  const generationRef = useRef(0);
  const composingRef = useRef(false);
  const reorderingRef = useRef(false);
  const mediaInFlightCountRef = useRef(0);
  const pendingMediaCountRef = useRef(0);
  const completedUnserializedMediaCountRef = useRef(0);
  const mountedRef = useRef(true);
  const bindingRef = useRef(Symbol("journal-lexical-binding"));
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [lifecycle, setLifecycle] = useState<LifecycleState>("ready");
  const [announcement, setAnnouncement] = useState("");
  const [mediaMessage, setMediaMessage] = useState("");
  const callbacksRef = useRef({
    onDocumentChange,
    onSelectImageFile,
    onDegraded,
  });
  useEffect(() => {
    callbacksRef.current = {
      onDocumentChange,
      onSelectImageFile,
      onDegraded,
    };
  }, [onDegraded, onDocumentChange, onSelectImageFile]);

  const degrade = useCallback((document = latestDocumentRef.current) => {
    if (!mountedRef.current) return;
    callbacksRef.current.onDegraded(document);
  }, []);

  const serialize = useCallback(
    (editorState = editor.getEditorState()): JournalDocumentV1 => {
      if (!mountedRef.current) return latestDocumentRef.current;
      setLifecycle("serializing");
      let document: JournalDocumentV1;
      try {
        document = lexicalEditorStateToJournalDocumentV1(editorState);
      } catch {
        degrade();
        return latestDocumentRef.current;
      }
      completedUnserializedMediaCountRef.current = 0;
      const hash = semanticJournalDocumentHash(document);
      if (hash !== latestHashRef.current) {
        const generation = generationRef.current + 1;
        generationRef.current = generation;
        latestDocumentRef.current = document;
        latestHashRef.current = hash;
        onLatestGoodDocument(document);
        if (mountedRef.current) {
          callbacksRef.current.onDocumentChange(document, { generation, hash });
        }
      }
      if (mountedRef.current) setLifecycle("ready");
      return document;
    },
    [degrade, editor, onLatestGoodDocument],
  );
  useEffect(() => {
    mountedRef.current = true;
    onReady();
    return () => {
      mountedRef.current = false;
      bindingRef.current = Symbol("destroyed-journal-lexical-binding");
    };
  }, [onReady]);

  useEffect(() => {
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(
    () =>
      editor.registerUpdateListener(
        ({ editorState, dirtyElements, dirtyLeaves, tags }) => {
          if (
            tags.has(JOURNAL_HYDRATION_TAG) ||
            (dirtyElements.size === 0 && dirtyLeaves.size === 0) ||
            composingRef.current ||
            reorderingRef.current ||
            mediaInFlightCountRef.current > 0
          ) {
            return;
          }
          serialize(editorState);
        },
      ),
    [editor, serialize],
  );

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;
    const onCompositionStart = () => {
      composingRef.current = true;
      setLifecycle("composing");
    };
    const onCompositionEnd = () => {
      composingRef.current = false;
      serialize();
    };
    root.addEventListener("compositionstart", onCompositionStart);
    root.addEventListener("compositionend", onCompositionEnd);
    return () => {
      root.removeEventListener("compositionstart", onCompositionStart);
      root.removeEventListener("compositionend", onCompositionEnd);
    };
  }, [editor, serialize]);

  // One or several photographs at once, in the order they were chosen
  // (`OVE-487`). Each file is refused or accepted on its own: one file over
  // the limit does not cost the gardener the other four.
  const chooseImages = useCallback(
    async (files: readonly File[]) => {
      if (disabled || !mountedRef.current || files.length === 0) return;
      const refusals = new Set<string>();
      const accepted: File[] = [];
      let capacity =
        MAX_JOURNAL_INLINE_IMAGES -
        journalDocumentImageCount(latestDocumentRef.current) -
        pendingMediaCountRef.current -
        completedUnserializedMediaCountRef.current;
      for (const file of files) {
        // A file over the limit or of another type is refused here, before a
        // block or the codec sees it, with the bounded copy (OVE-371).
        const refusal = classifyComposerPhotoRefusal(file);
        if (refusal) {
          refusals.add(
            refusal === "too_large"
              ? labels.imageTooLarge
              : labels.imageUnsupported,
          );
          continue;
        }
        if (capacity <= 0) {
          refusals.add(
            labels.imageLimit.replaceAll(
              "{max}",
              String(MAX_JOURNAL_INLINE_IMAGES),
            ),
          );
          continue;
        }
        capacity -= 1;
        accepted.push(file);
      }
      setMediaMessage([...refusals].join(" "));
      if (accepted.length === 0) return;
      const binding = bindingRef.current;
      if (imageInsertionMode === "immediate") {
        const planned = accepted.map((file) => ({
          file,
          blockId: createJournalBlockId(),
          mediaAssetId: crypto.randomUUID(),
        }));
        editor.update(
          () => {
            $insertJournalImages(
              planned.map(({ blockId, mediaAssetId }) =>
                $createOverGardenImageNode({ blockId, mediaAssetId }),
              ),
            );
          },
          { discrete: true },
        );
        serialize();
        for (const { file, blockId, mediaAssetId } of planned) {
          void callbacksRef.current
            .onSelectImageFile(file, blockId, mediaAssetId)
            .then((result) => {
              if (
                !mountedRef.current ||
                bindingRef.current !== binding ||
                (result.mediaAssetId && result.mediaAssetId !== mediaAssetId)
              ) {
                return;
              }
              if (result.previewUrl) {
                onPreviewResolved(mediaAssetId, result.previewUrl);
              }
            })
            .catch((error: unknown) => {
              // The photograph says so itself, with its reason and its
              // Retry, and the readiness line beside Publish counts it; a
              // third message here would only repeat them.
              if (mountedRef.current && bindingRef.current === binding) {
                onPreviewFailed(
                  mediaAssetId,
                  ephemeralStagingFailureCode(error),
                );
              }
            });
        }
        return;
      }
      for (const file of accepted) {
        if (!mountedRef.current || bindingRef.current !== binding) return;
        const blockId = createJournalBlockId();
        pendingMediaCountRef.current += 1;
        mediaInFlightCountRef.current += 1;
        setLifecycle("media_in_flight");
        let pendingReleased = false;
        let completedUnserialized = false;
        try {
          const result = await callbacksRef.current.onSelectImageFile(
            file,
            blockId,
          );
          if (
            !mountedRef.current ||
            bindingRef.current !== binding ||
            !result.mediaAssetId
          ) {
            return;
          }
          pendingMediaCountRef.current = Math.max(
            0,
            pendingMediaCountRef.current - 1,
          );
          pendingReleased = true;
          completedUnserializedMediaCountRef.current += 1;
          completedUnserialized = true;
          editor.update(
            () => {
              $insertJournalImages([
                $createOverGardenImageNode({
                  blockId,
                  mediaAssetId: result.mediaAssetId!,
                }),
              ]);
            },
            { discrete: true },
          );
          if (result.previewUrl) {
            onPreviewResolved(result.mediaAssetId, result.previewUrl);
          }
        } catch {
          if (completedUnserialized) {
            completedUnserializedMediaCountRef.current = Math.max(
              0,
              completedUnserializedMediaCountRef.current - 1,
            );
          }
          if (mountedRef.current && bindingRef.current === binding) {
            setMediaMessage(labels.imageFailed);
          }
        } finally {
          if (!pendingReleased) {
            pendingMediaCountRef.current = Math.max(
              0,
              pendingMediaCountRef.current - 1,
            );
          }
          if (mountedRef.current && bindingRef.current === binding) {
            mediaInFlightCountRef.current = Math.max(
              0,
              mediaInFlightCountRef.current - 1,
            );
            if (mediaInFlightCountRef.current === 0) serialize();
          }
        }
      }
    },
    [
      disabled,
      editor,
      imageInsertionMode,
      labels.imageFailed,
      labels.imageLimit,
      labels.imageTooLarge,
      labels.imageUnsupported,
      onPreviewFailed,
      onPreviewResolved,
      serialize,
    ],
  );
  const chooseImage = useCallback(
    (file: File) => chooseImages([file]),
    [chooseImages],
  );

  const updateReordering = useCallback(
    (value: boolean, options?: { serialize?: boolean }) => {
      reorderingRef.current = value;
      if (value) {
        setLifecycle("reordering");
      } else if (mountedRef.current && options?.serialize !== false) {
        serialize();
      }
    },
    [serialize],
  );

  const announce = useCallback((message: string) => {
    if (!mountedRef.current) return;
    setAnnouncement("");
    window.setTimeout(() => {
      if (mountedRef.current) setAnnouncement(message);
    }, 0);
  }, []);
  useEffect(() => {
    announceRef.current = announce;
    return () => {
      if (announceRef.current === announce) announceRef.current = null;
    };
  }, [announce, announceRef]);

  const rejectExternalContent = useCallback(() => {
    if (!mountedRef.current) return;
    setMediaMessage(labels.imageRejectRemote);
    announce(labels.imageRejectRemote);
  }, [announce, labels.imageRejectRemote]);

  useEffect(() => {
    if (!composerRef) return;
    const handle: StructuredJournalComposerHandle = {
      flushLatest: async () => {
        await waitForComposerIdle({
          isBusy: () =>
            composingRef.current ||
            reorderingRef.current ||
            mediaInFlightCountRef.current > 0,
        });
        return serialize();
      },
      getGeneration: () => generationRef.current,
      isComposing: () => composingRef.current,
      isReordering: () => reorderingRef.current,
      moveBlock: async (fromIndex, toIndex) => {
        let blockId = "";
        editor.getEditorState().read(() => {
          const node = $getRoot().getChildAtIndex(fromIndex);
          blockId = node ? $getJournalBlockId(node) : "";
        });
        if (!blockId) return;
        moveJournalBlockToIndex(editor, { blockId, toIndex });
        serialize();
      },
      moveBlockById: async (sourceBlockId, delta) => {
        const result = moveJournalBlockById(editor, sourceBlockId, delta);
        if (result === "moved") serialize();
        return result;
      },
      focus: () => editor.focus(),
    };
    composerRef.current = handle;
    return () => {
      if (composerRef.current === handle) composerRef.current = null;
    };
  }, [composerRef, disabled, editor, serialize]);

  return (
    <div
      className={cn(
        "structured-journal-composer relative grid gap-2 font-sans",
        className,
      )}
      data-structured-journal-composer="true"
      data-editor-engine="lexical"
      data-status={lifecycle}
      data-reorder-ready={lifecycle === "ready" ? "true" : "false"}
      lang={locale}
    >
      <div
        ref={containerRef}
        // The 56 px gutter is a pointer and keyboard enhancement; on a phone
        // it would take a sixth of the line and answer to no hover, so the
        // text gets the whole width and the tool row under it carries the
        // same blocks (DESIGN.md §5.11, `OVE-487`).
        className="journal-composer-canvas group/canvas relative mx-auto min-h-40 w-full sm:pr-2 sm:pl-14"
        data-lexical-journal-canvas="true"
      >
        <ContentEditable
          aria-label={labels.tools.editor}
          aria-keyshortcuts="Control+Shift+M Meta+Shift+M"
          // The product's own ring, not the browser's: a text surface always
          // matches :focus-visible, and the unlayered focus rule in
          // globals.css turned a bare `outline-none` into a black medium
          // outline around the whole story.
          className="min-h-32 rounded-sm text-base leading-normal outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring"
          spellCheck
        />
        <JournalPlaceholderPlugin
          placeholder={labels.blocks.placeholder}
          firstPlaceholder={labels.blocks.placeholderFirst}
          disabled={disabled}
        />
        <JournalFileDropPlugin
          containerRef={containerRef}
          disabled={disabled}
        />
        <JournalSelectionToolbar
          containerRef={containerRef}
          labels={labels}
          disabled={disabled}
        />
        <JournalSlashMenu
          containerRef={containerRef}
          copy={labels.blocks}
          disabled={disabled}
          onChooseImage={chooseImage}
        />
        <JournalBlockGutter
          containerRef={containerRef}
          copy={labels.blocks}
          reorderCopy={labels.reorder}
          tools={labels.tools}
          disabled={disabled}
          onReorderingChange={updateReordering}
          onAnnouncement={announce}
          onChooseImage={chooseImage}
        />
      </div>
      {/* Under the canvas, not inside it: ordinary buttons for a photo, the
          basic marks and every block, and the shortcut sheet at the end of the
          same row — none of them reachable only from within a
          `contenteditable` (`OVE-458`, `OVE-487`). */}
      <JournalComposerTools
        labels={labels}
        disabled={disabled}
        onChooseImages={(files) => void chooseImages(files)}
      />
      <JournalSafePastePlugin
        disabled={disabled}
        onChooseImage={chooseImage}
        onRejectedExternalContent={rejectExternalContent}
      />
      {mediaMessage ? (
        <p className="text-body-sm text-danger-text" role="alert">
          {mediaMessage}
        </p>
      ) : null}
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-lexical-reorder-live-region="true"
      >
        {announcement}
      </div>
    </div>
  );
}

/**
 * Puts photographs where the caret is (`OVE-487`). An empty line is replaced
 * rather than left standing above the first photograph, and the caret lands
 * on the line after the last one, so the gardener goes on writing where the
 * story continues. With no caret yet, the photographs go to the end, and an
 * empty document's one empty line is replaced the same way.
 *
 * **Nothing the gardener wrote is replaced.** Lexical's own `$insertNodes`
 * replaces whatever is selected: selected words, and — under a node
 * selection, which every block move leaves behind — the whole selected block.
 * A photograph added after moving a paragraph used to take that paragraph's
 * place. So a range is collapsed to its end first, and a selected block gets
 * the photographs after it.
 */
function $insertJournalImages(images: readonly LexicalNode[]): void {
  if (images.length === 0) return;
  const selection = $getSelection();
  const root = $getRoot();
  if ($isRangeSelection(selection) && !selection.isCollapsed()) {
    const end = selection.isBackward() ? selection.anchor : selection.focus;
    selection.anchor.set(end.key, end.offset, end.type);
    selection.focus.set(end.key, end.offset, end.type);
  }
  const anchorBlock = $isRangeSelection(selection)
    ? selection.anchor.getNode().getTopLevelElement()
    : null;
  const selectedBlock = $isNodeSelection(selection)
    ? (selection.getNodes().at(-1)?.getTopLevelElement() ?? null)
    : null;
  const emptyLine =
    anchorBlock && $isParagraphNode(anchorBlock) && anchorBlock.isEmpty()
      ? anchorBlock
      : !selection
        ? (() => {
            const last = root.getLastChild();
            return $isParagraphNode(last) && last.isEmpty() ? last : null;
          })()
        : null;
  const insertAfter = (anchor: LexicalNode) => {
    let previous = anchor;
    for (const image of images) {
      previous.insertAfter(image);
      previous = image;
    }
  };
  if (emptyLine) {
    insertAfter(emptyLine);
    emptyLine.remove();
  } else if (selectedBlock) {
    insertAfter(selectedBlock);
  } else if ($isRangeSelection(selection)) {
    $insertNodes([...images]);
  } else {
    root.append(...images);
  }
  const last = images.at(-1)!;
  const next = last.getNextSibling();
  if ($isParagraphNode(next)) {
    next.selectStart();
    return;
  }
  const trailing = $setJournalBlockId(
    $createParagraphNode(),
    createJournalBlockId(),
  );
  last.insertAfter(trailing);
  trailing.selectStart();
}

/** The same list back when nothing changed, so a memo keyed on it holds. */
function sameIds(
  current: readonly string[],
  next: readonly string[],
): readonly string[] {
  return current.length === next.length &&
    current.every((id, index) => id === next[index])
    ? current
    : next;
}
