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
import type { JournalBlockCommandId } from "./lexical-journal/journal-block-commands";
import type { JournalImageUiState } from "./lexical-journal/journal-lexical-image-node";

export type JournalReorderBlockTypeClass =
  | "paragraph"
  | "header"
  | "list"
  | "quote"
  | "callout"
  | "code"
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

/**
 * The gutter, the block menu and the slash menu all speak these words. One
 * record per command id, so a command cannot exist without a name (ADR-0028).
 */
export interface JournalBlockCommandCopy {
  add: string;
  menu: string;
  turnInto: string;
  duplicate: string;
  duplicatedAnnouncement: string;
  noResults: string;
  placeholder: string;
  placeholderFirst: string;
  commands: Record<JournalBlockCommandId, string>;
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
  /**
   * Where one photograph is in the three steps it takes — decode, encode,
   * stage — so "processing" stops being the only thing a reader is told
   * while a large photograph is converted (`OVE-458` AC4).
   */
  imagePhase: Record<"decoding" | "encoding" | "staging", string>;
  /**
   * Why a photograph failed, per code, with `fallback` for a code this list
   * has not met. "It failed" is not a reason, and the one action a reader has
   * — retry, or choose a different file — depends on which of these it was.
   */
  imageFailureReason: Record<
    | "operation_aborted"
    | "retry_limit_exceeded"
    | "media_limit_exceeded"
    | "media_preparation_failed"
    | "fallback",
    string
  >;
  /** The staging lease could not be renewed (`OVE-372`, `OVE-458` AC4). */
  imageLeaseAtRisk: string;
  /** A dropped, pasted, or picked file over the 50 MiB limit (OVE-371). */
  imageTooLarge: string;
  /** A file that is not a JPEG, PNG, WebP, or HEIC photo. */
  imageUnsupported: string;
  imageRetry: string;
  imageReplace: string;
  imageSetCover: string;
  imageCaption: string;
  imageCaptionPlaceholder: string;
  imageRemove: string;
  imageRejectRemote: string;
  /** "Фото {index}": a photograph named by its position (`OVE-487`). */
  imageName: string;
  /** "{action}: {photo}": a control named with the photograph it acts on. */
  imageActionName: string;
  imageMoveUp: string;
  imageMoveDown: string;
  /**
   * A staged photograph, ready to go out with the entry. Never "uploaded" or
   * "saved": nothing is public until Publish is acknowledged.
   */
  imageReady: string;
  /** More photographs than one entry holds; `{max}` is the limit. */
  imageLimit: string;
  /**
   * The composer's ordinary controls under the text (`OVE-487`, ADR-0028 D3
   * as amended): the group's name and the two controls that carry words.
   */
  composerTools: {
    label: string;
    addPhoto: string;
    blocks: string;
  };
  /** Every photograph's state at once, beside Publish (`OVE-487`). */
  readiness: {
    /** `{ready}` of `{total}` prepared; Publish waits for the rest. */
    preparing: string;
    /** `{total}` prepared, going out with the entry. */
    ready: string;
    /** `{photos}` failed; each must be retried or removed first. */
    failed: string;
  };
  unavailableTitle: string;
  unavailableBody: string;
  titleLabel: string;
  dateLabel: string;
  saveLabel: string;
  tools: {
    /** Accessible name of the floating selection toolbar. */
    toolbar: string;
    editor: string;
    bold: string;
    italic: string;
    underline: string;
    strikethrough: string;
    code: string;
    link: string;
    applyLink: string;
    cancelLink: string;
    quoteAttribution: string;
    removeQuoteAttribution: string;
  };

  /**
   * The shortcut sheet's own words (`OVE-458`). Every *row* is generated from
   * the module that implements the rule; these are the headings around them.
   */
  shortcuts: {
    open: string;
    title: string;
    inputRules: string;
    inline: string;
    keys: string;
    slashMenu: string;
    blockMenu: string;
    moveBlock: string;
  };

  reorder: JournalBlockReorderCopy;
  blocks: JournalBlockCommandCopy;
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
  /** The photograph the cover resolves to, so its block can say so. */
  coverMediaAssetId?: string | null;
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
          <p className="text-body-sm text-text-muted">{labels.failureBody}</p>
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
          className="min-h-11 justify-self-start rounded px-2 text-body-sm underline"
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
      <p className="text-body-sm text-text-muted">{labels.loading}</p>
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
