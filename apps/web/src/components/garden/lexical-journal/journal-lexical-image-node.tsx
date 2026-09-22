"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNodeByKey, HISTORY_PUSH_TAG, type NodeKey } from "lexical";
import {
  createContext,
  useContext,
  useId,
  useRef,
  type ReactNode,
} from "react";

import { ArrowClockwiseIcon } from "@/components/icons/ArrowClockwise";
import { ArrowDownIcon } from "@/components/icons/ArrowDown";
import { ArrowsClockwiseIcon } from "@/components/icons/ArrowsClockwise";
import { ArrowUpIcon } from "@/components/icons/ArrowUp";
import { StarIcon } from "@/components/icons/Star";
import { XIcon } from "@/components/icons/X";
import { COMPOSER_PHOTO_ACCEPT } from "@/lib/garden/composer-photo-selection";
import { MAX_JOURNAL_IMAGE_CAPTION_CHARS } from "@/lib/garden/journal-document";
import { cn } from "@/lib/utils";
import { $isOverGardenImageNode } from "./journal-lexical-nodes";
import { FileDrop } from "@/components/ui/file-drop";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Textarea } from "@/components/ui/textarea";

/** The three steps of preparing one photograph, as a share of the whole. */
const MEDIA_PHASE_PROGRESS: Readonly<Record<string, number>> = {
  selected: 5,
  decoding: 25,
  encoding: 60,
  staging: 85,
  ready: 100,
};

/** How much of a caption a control's name repeats before it stops. */
const NAME_CAPTION_CHARS = 48;

export interface JournalImageUiState {
  status: "selected" | "decoding" | "encoding" | "staging" | "ready" | "failed";
  previewUrl: string | null;
  failureCode: string | null;
  /**
   * Where the photograph came from: `staged` in this session, or `existing`
   * in an entry already published. Only a staged one is "ready to publish";
   * an existing one already is published and says nothing (`OVE-487`).
   */
  source?: "existing" | "staged";
}

export interface JournalImagePreviewContextValue {
  disabled: boolean;
  getState(mediaAssetId: string): JournalImageUiState | undefined;
  /** The document's photographs in reading order, by media asset id. */
  imageOrder?: readonly string[];
  /** Every block in reading order, by block id: where a move can go. */
  blockOrder?: readonly string[];
  /** The photograph the entry's cover resolves to, when there is one. */
  coverMediaAssetId?: string | null;
  labels: {
    processing: string;
    /** Which of the three steps this photograph is in (`OVE-458` AC4). */
    phase: Record<"decoding" | "encoding" | "staging", string>;
    /** Why it failed, per code, with `fallback` for one this list has not met. */
    failureReason: Record<string, string>;
    failed: string;
    retry: string;
    replace: string;
    remove: string;
    setCover: string;
    /** The caption field's own label, read by a screen reader. */
    caption: string;
    /** Placeholder text: what a useful caption says. */
    captionPlaceholder: string;
    /** "Фото {index}" — a photograph's name by its position. */
    name?: string;
    /** "{action}: {photo}" — a control's name with the photograph it acts on. */
    actionName?: string;
    moveUp?: string;
    moveDown?: string;
    /** A staged photograph that will be published with the entry. */
    ready?: string;
    /** "{type} moved to {position} of {total}" (`reorder.movedAnnouncement`). */
    moved?: string;
  };
  onRemove(blockId: string, mediaAssetId: string): void;
  onRetry(mediaAssetId: string): void;
  onReplace(mediaAssetId: string, file: File): void;
  onSetCover(mediaAssetId: string): void;
  /** The live region the composer owns, for a move said out loud. */
  announce?(message: string): void;
}

const JournalImagePreviewContext =
  createContext<JournalImagePreviewContextValue | null>(null);

export function JournalImagePreviewProvider({
  value,
  children,
}: {
  value: JournalImagePreviewContextValue;
  children: ReactNode;
}) {
  return (
    <JournalImagePreviewContext.Provider value={value}>
      {children}
    </JournalImagePreviewContext.Provider>
  );
}

/**
 * The photograph's name, for every control that acts on it: its position,
 * and the start of its caption when it has one — "Фото 2 — Жовті плями на
 * нижньому листі". A remove button named only "Remove" leaves a screen-reader
 * user guessing which of five photographs goes (`OVE-487` criterion 4).
 */
export function journalImageName(
  template: string,
  position: number,
  caption: string,
): string {
  const base = template.replaceAll("{index}", String(position));
  const text = caption.trim().replace(/\s+/gu, " ");
  if (!text) return base;
  const excerpt =
    text.length > NAME_CAPTION_CHARS
      ? `${text.slice(0, NAME_CAPTION_CHARS - 1).trimEnd()}…`
      : text;
  return `${base} — ${excerpt}`;
}

export function JournalLexicalImageNodeView({
  blockId,
  mediaAssetId,
  caption,
  nodeKey,
}: {
  blockId: string;
  mediaAssetId: string;
  caption: string;
  nodeKey: NodeKey;
}) {
  const [editor] = useLexicalComposerContext();
  const context = useContext(JournalImagePreviewContext);
  const inputId = useId();
  const replacementInputRef = useRef<HTMLInputElement | null>(null);
  const state = context?.getState(mediaAssetId);
  const previewUrl = state?.previewUrl;
  const failed = state?.status === "failed";
  const busy = Boolean(state && state.status !== "ready" && !failed);
  const order = context?.imageOrder ?? [];
  const index = order.indexOf(mediaAssetId);
  const position = index >= 0 ? index + 1 : order.length + 1;
  const blocks = context?.blockOrder ?? [];
  const blockIndex = blocks.indexOf(blockId);
  const labels = context?.labels;
  const name = journalImageName(labels?.name ?? "{index}", position, caption);
  const named = (action: string) =>
    (labels?.actionName ?? "{action}: {photo}")
      .replaceAll("{action}", action)
      .replaceAll("{photo}", name);
  const isCover = Boolean(
    context?.coverMediaAssetId && context.coverMediaAssetId === mediaAssetId,
  );

  function move(delta: -1 | 1) {
    if (!context || context.disabled) return;
    // One block past its neighbour — the gutter's move up/down, with the
    // committed root children still the only ordering authority (ADR-0028
    // D3). Written here rather than through the block-order module, which
    // imports the node that imports this view.
    let blockPosition = 0;
    let total = 0;
    let photoPosition = 0;
    editor.update(
      () => {
        const node = $getNodeByKey(nodeKey);
        if (!node) return;
        const neighbour =
          delta < 0 ? node.getPreviousSibling() : node.getNextSibling();
        if (!neighbour) return;
        if (delta < 0) neighbour.insertBefore(node);
        else neighbour.insertAfter(node);
        // By key: moving the node made a writable copy of it, and the copy,
        // not the object in hand, is the one in the tree now.
        const siblings = node.getParentOrThrow().getChildren();
        const isThis = (candidate: { getKey(): NodeKey }) =>
          candidate.getKey() === nodeKey;
        blockPosition = siblings.findIndex(isThis) + 1;
        total = siblings.length;
        photoPosition =
          siblings.filter($isOverGardenImageNode).findIndex(isThis) + 1;
      },
      { discrete: true, tag: HISTORY_PUSH_TAG },
    );
    if (blockPosition === 0) return;
    if (labels?.moved) {
      // Said by the name it has now — the photograph that was "Фото 1" is
      // "Фото 2" once it has moved below another.
      context.announce?.(
        labels.moved
          .replaceAll(
            "{type}",
            journalImageName(labels.name ?? "{index}", photoPosition, caption),
          )
          .replaceAll("{position}", String(blockPosition))
          .replaceAll("{total}", String(total)),
      );
    }
    // Moving a block moves its element, and a moved element drops the focus
    // it held; the control the reader pressed takes it back, or its twin when
    // the photograph has reached an end.
    window.requestAnimationFrame(() => {
      const root = editor.getRootElement();
      const select = (action: string) =>
        root?.querySelector<HTMLButtonElement>(
          `[data-journal-image-action="${action}"][data-media-asset-id="${mediaAssetId}"]`,
        );
      const same = select(delta < 0 ? "move-up" : "move-down");
      const other = select(delta < 0 ? "move-down" : "move-up");
      (same && !same.disabled ? same : other)?.focus();
    });
  }

  const action =
    "inline-flex h-8 items-center gap-1 rounded-md px-2 text-caption text-text-secondary hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:pointer-events-none disabled:opacity-40 aria-pressed:bg-action-subtle aria-pressed:text-action-subtle-text";

  return (
    <div
      className="grid gap-2"
      data-lexical-journal-image-content="true"
      data-media-status={state?.status ?? "ready"}
      data-media-failure={
        failed ? (state?.failureCode ?? "unknown") : undefined
      }
      data-media-asset-id={mediaAssetId}
      aria-busy={busy || undefined}
      aria-describedby={failed ? `${inputId}-error` : undefined}
    >
      {previewUrl ? (
        // The URL resolves the exact final WebP Blob and never enters Lexical
        // state. The photograph keeps its own shape — a portrait is not
        // stretched into a landscape box or padded out to the column's width
        // (`OVE-487` criterion 3).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt={caption}
          className="mx-auto block h-auto max-h-128 w-auto max-w-full rounded-md"
        />
      ) : (
        <div
          className="h-40 animate-pulse rounded-md bg-surface-sunken"
          aria-hidden="true"
        />
      )}

      {/* Where this photograph is, in words: read on this device, compressed
          to WebP on this device, sent to temporary storage, ready. "Ready"
          means ready to publish, never published — nothing is public until
          Publish is acknowledged (`OVE-458` AC4, `OVE-487` criterion 2). */}
      {busy && context ? (
        <div className="grid gap-1" role="status">
          <p className="text-body-sm text-text-muted">
            {state?.status === "decoding" ||
            state?.status === "encoding" ||
            state?.status === "staging"
              ? context.labels.phase[state.status]
              : context.labels.processing}
          </p>
          <ProgressBar
            label={`${context.labels.processing} ${name}`}
            value={MEDIA_PHASE_PROGRESS[state?.status ?? "selected"] ?? 0}
          />
        </div>
      ) : null}
      {failed && context ? (
        <p
          id={`${inputId}-error`}
          className="text-body-sm text-danger-text"
          role="alert"
        >
          {/* The reason is the whole message: it says what failed and the one
              thing to do about it (`OVE-458` AC4). */}
          {context.labels.failureReason[state?.failureCode ?? ""] ??
            context.labels.failureReason.fallback}
        </p>
      ) : null}
      {state?.status === "ready" &&
      state.source === "staged" &&
      labels?.ready ? (
        <p
          className="text-caption text-text-muted"
          data-journal-image-ready="true"
        >
          {labels.ready}
        </p>
      ) : null}

      {context ? (
        // The caption is the picture's sentence, and it is the `alt` a screen
        // reader and an image crawler are given (OVE-432). A plain text area
        // inside the editor: it is in the tab order, it needs no hydration to
        // hold what was typed, and it grows with the text (ADR-0024).
        <Textarea
          // No `name`: the caption reaches the server inside the document the
          // editor serialises, and a second copy in the form post would be a
          // second place to read it from. The caption sits under the picture
          // with no room for a label above it, so it carries its own name
          // rather than a `Field` (DESIGN.md §5.3).
          aria-label={`${context.labels.caption}: ${journalImageName(labels?.name ?? "{index}", position, "")}`}
          defaultValue={caption}
          rows={1}
          size="sm"
          maxLength={MAX_JOURNAL_IMAGE_CAPTION_CHARS}
          disabled={context.disabled}
          placeholder={context.labels.captionPlaceholder}
          data-journal-image-caption={mediaAssetId}
          className="resize-none border-transparent bg-transparent text-text-muted hover:border-border focus:border-border focus:text-text"
          onChange={(event) => {
            const next = event.currentTarget.value;
            editor.update(() => {
              const node = $getNodeByKey(nodeKey);
              if ($isOverGardenImageNode(node)) node.setCaption(next);
            });
          }}
        />
      ) : null}

      {context ? (
        // Always on the screen, never behind a hover: a phone has no hover,
        // and a control that appears only on focus is one nobody tabs to
        // (`OVE-487` criterion 2). Each one says which photograph it acts on.
        <div
          className="flex flex-wrap items-center gap-1"
          data-journal-image-actions="true"
          // These buttons live inside the editor's root, and Lexical listens
          // for keys there: Enter on a focused button became a new paragraph
          // and never pressed it. A key pressed on a control is the control's.
          onKeyDown={(event) => event.stopPropagation()}
        >
          {labels?.moveUp ? (
            <button
              type="button"
              disabled={context.disabled || blockIndex <= 0}
              className={action}
              aria-label={named(labels.moveUp)}
              title={labels.moveUp}
              data-journal-image-action="move-up"
              data-media-asset-id={mediaAssetId}
              onClick={() => move(-1)}
            >
              <ArrowUpIcon aria-hidden="true" className="size-4" />
            </button>
          ) : null}
          {labels?.moveDown ? (
            <button
              type="button"
              disabled={
                context.disabled ||
                blockIndex < 0 ||
                blockIndex >= blocks.length - 1
              }
              className={action}
              aria-label={named(labels.moveDown)}
              title={labels.moveDown}
              data-journal-image-action="move-down"
              data-media-asset-id={mediaAssetId}
              onClick={() => move(1)}
            >
              <ArrowDownIcon aria-hidden="true" className="size-4" />
            </button>
          ) : null}
          {failed ? (
            <button
              type="button"
              disabled={context.disabled}
              className={action}
              aria-label={named(context.labels.retry)}
              data-journal-image-action="retry"
              data-media-asset-id={mediaAssetId}
              onClick={() => context.onRetry(mediaAssetId)}
            >
              <ArrowClockwiseIcon aria-hidden="true" className="size-4" />
              {context.labels.retry}
            </button>
          ) : null}
          <button
            type="button"
            disabled={context.disabled}
            className={action}
            aria-label={named(context.labels.replace)}
            data-journal-image-action="replace"
            data-media-asset-id={mediaAssetId}
            onClick={() => replacementInputRef.current?.click()}
          >
            <ArrowsClockwiseIcon aria-hidden="true" className="size-4" />
            {context.labels.replace}
          </button>
          <button
            type="button"
            disabled={context.disabled}
            className={action}
            aria-label={named(context.labels.setCover)}
            aria-pressed={isCover}
            data-journal-image-action="cover"
            data-media-asset-id={mediaAssetId}
            onClick={() => context.onSetCover(mediaAssetId)}
          >
            <StarIcon aria-hidden="true" className="size-4" />
            {context.labels.setCover}
          </button>
          <button
            type="button"
            disabled={context.disabled && !failed}
            className={cn(action, "ml-auto")}
            aria-label={named(context.labels.remove)}
            data-journal-image-action="remove"
            data-media-asset-id={mediaAssetId}
            onClick={() => {
              if (context.disabled && !failed) return;
              editor.update(() => {
                const node = $getNodeByKey(nodeKey);
                node?.remove();
              });
              context.onRemove(blockId, mediaAssetId);
            }}
          >
            <XIcon aria-hidden="true" className="size-4" />
            {context.labels.remove}
          </button>
          <FileDrop
            ref={replacementInputRef}
            accept={COMPOSER_PHOTO_ACCEPT}
            disabled={context.disabled}
            label={named(context.labels.replace)}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) context.onReplace(mediaAssetId, file);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
