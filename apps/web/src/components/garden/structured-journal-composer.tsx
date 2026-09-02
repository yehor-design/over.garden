"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ComponentType,
  type MutableRefObject,
} from "react";

import { JournalDocumentRenderer } from "@/components/garden/journal-document-renderer";
import {
  createEmptyJournalDocument,
  normalizeJournalDocumentOrThrow,
  type JournalDocumentV1,
} from "@/lib/garden/journal-document";
import type { PublicLocale } from "@/lib/public-localization";
import { cn } from "@/lib/utils";
import type { JournalImageUiState } from "./lexical-journal/journal-lexical-image-node";

export type JournalReorderBlockTypeClass =
  | "paragraph"
  | "header"
  | "list"
  | "quote"
  | "delimiter"
  | "image"
  | "unknown";

export interface JournalBlockReorderCopy {
  moveUp: string;
  moveDown: string;
  dragHandle: string;
  deleteBlock: string;
  movedAnnouncement: string;
  deletedAnnouncement: string;
  blockType: Record<JournalReorderBlockTypeClass, string>;
}

export interface StructuredJournalComposerLabels {
  loading: string;
  failureTitle: string;
  failureBody: string;
  retry: string;
  silentLoss: string;
  imageChoose: string;
  imageUploading: string;
  imageFailed: string;
  imageRetry: string;
  imageReplace: string;
  imageSetCover: string;
  imageRemove: string;
  imageRejectRemote: string;
  unavailableTitle: string;
  unavailableBody: string;
  titleLabel: string;
  dateLabel: string;
  saveLabel: string;
  tools: {
    toolbar: string;
    editor: string;
    paragraph: string;
    header: string;
    heading2: string;
    heading3: string;
    list: string;
    unorderedList: string;
    orderedList: string;
    indentList: string;
    outdentList: string;
    quote: string;
    quoteAttribution: string;
    removeQuoteAttribution: string;
    delimiter: string;
    image: string;
    bold: string;
    italic: string;
    link: string;
    applyLink: string;
    cancelLink: string;
    undo: string;
    redo: string;
  };
  reorder: JournalBlockReorderCopy;
}

export interface StructuredJournalComposerProps {
  locale: PublicLocale;
  labels: StructuredJournalComposerLabels;
  initialDocument?: JournalDocumentV1 | null;
  bindingReady?: boolean;
  imagePreviewUrls?: ReadonlyMap<string, string>;
  imageStates?: ReadonlyMap<string, JournalImageUiState>;
  imageInsertionMode?: "after-ready" | "immediate";
  disabled?: boolean;
  className?: string;
  onDocumentChange: (
    document: JournalDocumentV1,
    meta: { generation: number; hash: string },
  ) => void;
  onSelectImageFile: (
    file: File,
    blockId: string,
    mediaAssetId?: string,
  ) => Promise<{ mediaAssetId?: string; previewUrl?: string }>;
  onRemoveImageBlock?: (blockId: string, mediaAssetId: string) => void;
  onRetryImage?: (mediaAssetId: string) => void;
  onReplaceImage?: (mediaAssetId: string, file: File) => void;
  onSetImageAsCover?: (mediaAssetId: string) => void;
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
  focus: () => void;
}

type JournalLexicalClientModule =
  typeof import("./lexical-journal/journal-lexical-client");
type JournalLexicalClientComponent = ComponentType<
  StructuredJournalComposerProps & {
    onReady(): void;
    onDegraded(document: JournalDocumentV1): void;
  }
>;

export function StructuredJournalComposer(
  props: StructuredJournalComposerProps,
) {
  if (props.bindingReady === false) {
    return (
      <StructuredJournalComposerLoading
        className={props.className}
        labels={props.labels}
        locale={props.locale}
      />
    );
  }

  return <StructuredJournalComposerBound {...props} />;
}

function StructuredJournalComposerBound(props: StructuredJournalComposerProps) {
  const {
    className,
    composerRef,
    initialDocument,
    labels,
    locale,
    onDocumentChange: notifyDocumentChange,
  } = props;
  const [initialBinding] = useState(() =>
    resolveInitialBinding(initialDocument),
  );
  const [initialInvalid, setInitialInvalid] = useState(initialBinding.invalid);
  const [latestDocument, setLatestDocument] = useState(initialBinding.document);
  const [fallbackDocument, setFallbackDocument] = useState(
    initialBinding.document,
  );
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    initialBinding.invalid ? "failed" : "loading",
  );
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [Client, setClient] = useState<JournalLexicalClientComponent | null>(
    null,
  );

  useEffect(() => {
    if (initialInvalid) return;
    let cancelled = false;
    void import("./lexical-journal/journal-lexical-client")
      .then((module: JournalLexicalClientModule) => {
        if (cancelled) return;
        setClient(() => module.JournalLexicalClient);
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [initialInvalid, retryGeneration]);

  useEffect(() => {
    if (status !== "failed" || !composerRef) return;
    composerRef.current = null;
  }, [composerRef, status]);

  const onReady = useCallback(() => setStatus("ready"), []);
  const onDegraded = useCallback((document: JournalDocumentV1) => {
    setLatestDocument(document);
    setFallbackDocument(document);
    setStatus("failed");
  }, []);
  const onDocumentChange = useCallback(
    (
      document: JournalDocumentV1,
      meta: { generation: number; hash: string },
    ) => {
      setLatestDocument(document);
      setFallbackDocument(document);
      notifyDocumentChange(document, meta);
    },
    [notifyDocumentChange],
  );

  if (status === "failed") {
    return (
      <div
        className={cn(
          "grid gap-3 rounded-md border border-border p-3",
          className,
        )}
        data-structured-journal-composer="failed"
        data-editor-engine="lexical"
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
          className="min-h-11 justify-self-start rounded px-2 text-sm underline"
          onClick={() => {
            if (initialInvalid) {
              const rebound = resolveInitialBinding(initialDocument);
              if (rebound.invalid) return;
              setLatestDocument(rebound.document);
              setFallbackDocument(rebound.document);
            }
            setInitialInvalid(false);
            setStatus("loading");
            setClient(null);
            setRetryGeneration((current) => current + 1);
          }}
        >
          {labels.retry}
        </button>
      </div>
    );
  }

  if (!Client) {
    return (
      <StructuredJournalComposerLoading
        className={className}
        labels={labels}
        locale={locale}
      />
    );
  }

  return (
    <Client
      key={retryGeneration}
      {...props}
      initialDocument={latestDocument}
      onDocumentChange={onDocumentChange}
      onReady={onReady}
      onDegraded={onDegraded}
    />
  );
}

function StructuredJournalComposerLoading({
  className,
  labels,
  locale,
}: Pick<StructuredJournalComposerProps, "className" | "labels" | "locale">) {
  return (
    <div
      className={cn("min-h-40", className)}
      data-structured-journal-composer="true"
      data-editor-engine="lexical"
      data-status="loading"
      aria-busy="true"
      lang={locale}
    >
      <p className="text-sm text-muted-foreground">{labels.loading}</p>
    </div>
  );
}

function resolveInitialBinding(
  document: JournalDocumentV1 | null | undefined,
): { document: JournalDocumentV1; invalid: boolean } {
  try {
    return {
      document: normalizeJournalDocumentOrThrow(
        document ?? createEmptyJournalDocument(),
      ),
      invalid: false,
    };
  } catch {
    return { document: createEmptyJournalDocument(), invalid: true };
  }
}
