"use client";

import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
} from "lexical";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ephemeralStagingFailureCode } from "@/lib/media/ephemeral-staging-client";

import {
  $createOverGardenImageNode,
  $getJournalBlockId,
  $setJournalBlockId,
  createJournalBlockId,
  JournalImagePreviewProvider,
} from "./journal-lexical-nodes";
import { createJournalLexicalExtension } from "./journal-lexical-extensions";
import { JournalLexicalToolbar } from "./journal-lexical-toolbar";
import {
  JournalNodeReorderPlugin,
  moveJournalBlockById,
  moveJournalBlockToIndex,
} from "./journal-node-reorder-plugin";
import { JournalSafePastePlugin } from "./journal-safe-paste-plugin";
import type {
  StructuredJournalComposerHandle,
  StructuredJournalComposerProps,
} from "@/components/garden/structured-journal-composer";
import { waitForComposerIdle } from "@/lib/garden/composer-idle-deadline";
import {
  lexicalEditorStateToJournalDocumentV1,
  JOURNAL_HYDRATION_TAG,
} from "@/lib/garden/journal-document-lexical-adapter";
import {
  createEmptyJournalDocument,
  journalDocumentImageCount,
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
  const onLatestGoodDocument = useCallback(
    (document: JournalDocumentV1) => degradationBridge.record(document),
    [degradationBridge],
  );
  const previewContext = useMemo(
    () => ({
      disabled: props.disabled ?? false,
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
        failed: props.labels.imageFailed,
        retry: props.labels.imageRetry,
        replace: props.labels.imageReplace,
        remove: props.labels.imageRemove,
        setCover: props.labels.imageSetCover,
      },
      onRemove: (blockId: string, mediaAssetId: string) => {
        onPreviewRemoved(mediaAssetId);
        onRemoveImageBlock?.(blockId, mediaAssetId);
      },
      onRetry: (mediaAssetId: string) => onRetryImage?.(mediaAssetId),
      onReplace: (mediaAssetId: string, file: File) =>
        onReplaceImage?.(mediaAssetId, file),
      onSetCover: (mediaAssetId: string) =>
        onSetImageAsCover?.(mediaAssetId),
    }),
    [
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
      props.labels.imageRemove,
      props.labels.imageReplace,
      props.labels.imageRetry,
      props.labels.imageSetCover,
      props.labels.imageUploading,
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
        />
      </LexicalExtensionComposer>
    </JournalImagePreviewProvider>
  );
}

interface JournalLexicalClientBodyProps extends JournalLexicalClientProps {
  onPreviewResolved(mediaAssetId: string, previewUrl: string): void;
  onPreviewFailed(mediaAssetId: string, failureCode: string): void;
  onLatestGoodDocument(document: JournalDocumentV1): void;
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

  const chooseImage = useCallback(
    async (file: File) => {
      if (disabled || !mountedRef.current) return;
      if (
        journalDocumentImageCount(latestDocumentRef.current) +
          pendingMediaCountRef.current +
          completedUnserializedMediaCountRef.current >=
        MAX_JOURNAL_INLINE_IMAGES
      ) {
        setMediaMessage(labels.failureBody);
        return;
      }
      const binding = bindingRef.current;
      const blockId = createJournalBlockId();
      if (imageInsertionMode === "immediate") {
        const mediaAssetId = crypto.randomUUID();
        editor.update(
          () => {
            const image = $createOverGardenImageNode({ blockId, mediaAssetId });
            const trailing = $setJournalBlockId(
              $createParagraphNode(),
              createJournalBlockId(),
            );
            if ($getSelection()) $insertNodes([image, trailing]);
            else $getRoot().append(image, trailing);
            trailing.selectStart();
          },
          { discrete: true },
        );
        serialize();
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
            if (mountedRef.current && bindingRef.current === binding) {
              onPreviewFailed(mediaAssetId, ephemeralStagingFailureCode(error));
              setMediaMessage(labels.imageFailed);
            }
          });
        return;
      }
      pendingMediaCountRef.current += 1;
      mediaInFlightCountRef.current += 1;
      setLifecycle("media_in_flight");
      setMediaMessage("");
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
            const image = $createOverGardenImageNode({
              blockId,
              mediaAssetId: result.mediaAssetId!,
            });
            const trailing = $setJournalBlockId(
              $createParagraphNode(),
              createJournalBlockId(),
            );
            if ($getSelection()) {
              $insertNodes([image, trailing]);
            } else {
              $getRoot().append(image, trailing);
            }
            trailing.selectStart();
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
          setMediaMessage(labels.failureBody);
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
    },
    [
      disabled,
      editor,
      imageInsertionMode,
      labels.failureBody,
      labels.imageFailed,
      onPreviewFailed,
      onPreviewResolved,
      serialize,
    ],
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
      insertVoiceTranscript: async (transcript) => {
        const text = transcript.trim();
        if (!text || disabled) return;
        editor.update(
          () => {
            const paragraph = $setJournalBlockId(
              $createParagraphNode(),
              createJournalBlockId(),
            );
            paragraph.append($createTextNode(text));
            const selection = $getSelection();
            const top = $isRangeSelection(selection)
              ? selection.anchor.getNode().getTopLevelElement()
              : null;
            if (top) top.insertAfter(paragraph);
            else $getRoot().append(paragraph);
            paragraph.selectEnd();
          },
          { discrete: true },
        );
        serialize();
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
      <JournalLexicalToolbar
        labels={labels}
        disabled={disabled}
        onChooseImage={chooseImage}
      />
      <div
        ref={containerRef}
        className="relative min-h-40 rounded-md border border-input bg-background py-3 pr-3 pl-14 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
        data-lexical-journal-canvas="true"
      >
        <ContentEditable
          aria-label={labels.tools.editor}
          className="min-h-32 outline-none"
          spellCheck
        />
        <JournalNodeReorderPlugin
          containerRef={containerRef}
          copy={labels.reorder}
          disabled={disabled}
          onReorderingChange={updateReordering}
          onAnnouncement={announce}
        />
      </div>
      <JournalSafePastePlugin
        disabled={disabled}
        onChooseImage={chooseImage}
        onRejectedExternalContent={rejectExternalContent}
      />
      {mediaMessage ? (
        <p className="text-sm text-destructive" role="alert">
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
