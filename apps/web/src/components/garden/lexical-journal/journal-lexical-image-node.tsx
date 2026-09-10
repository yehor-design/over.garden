"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNodeByKey, type NodeKey } from "lexical";
import {
  createContext,
  useContext,
  useId,
  useRef,
  type ReactNode,
} from "react";

import { COMPOSER_PHOTO_ACCEPT } from "@/lib/garden/composer-photo-selection";

export interface JournalImageUiState {
  status: "selected" | "decoding" | "encoding" | "staging" | "ready" | "failed";
  previewUrl: string | null;
  failureCode: string | null;
}

export interface JournalImagePreviewContextValue {
  disabled: boolean;
  getState(mediaAssetId: string): JournalImageUiState | undefined;
  labels: {
    processing: string;
    failed: string;
    retry: string;
    replace: string;
    remove: string;
    setCover: string;
  };
  onRemove(blockId: string, mediaAssetId: string): void;
  onRetry(mediaAssetId: string): void;
  onReplace(mediaAssetId: string, file: File): void;
  onSetCover(mediaAssetId: string): void;
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

export function JournalLexicalImageNodeView({
  blockId,
  mediaAssetId,
  nodeKey,
}: {
  blockId: string;
  mediaAssetId: string;
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

  const action =
    "flex h-8 items-center rounded border border-border bg-background/90 px-2 text-xs backdrop-blur-sm hover:bg-accent hover:text-accent-foreground disabled:opacity-40";

  return (
    <div
      className="group/photo relative grid gap-2"
      data-lexical-journal-image-content="true"
      data-media-status={state?.status ?? "ready"}
      aria-busy={busy || undefined}
      aria-describedby={failed ? `${inputId}-error` : undefined}
    >
      {previewUrl ? (
        // The URL resolves the exact final WebP Blob and never enters Lexical state.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt=""
          className="max-h-128 w-full rounded-md object-contain"
        />
      ) : (
        <div
          className="h-40 animate-pulse rounded-md bg-muted"
          aria-hidden="true"
        />
      )}

      {busy && context ? (
        <p className="text-sm text-muted-foreground" role="status">
          {context.labels.processing}
        </p>
      ) : null}
      {failed && context ? (
        <p
          id={`${inputId}-error`}
          className="text-sm text-destructive"
          role="alert"
        >
          {context.labels.failed}
        </p>
      ) : null}

      {context ? (
        // Notion shows a photo, not a card of buttons: the controls appear on
        // hover, and on focus so a keyboard reaches them just as well.
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-focus-within/photo:opacity-100 group-hover/photo:opacity-100 motion-reduce:transition-none">
          {failed ? (
            <button
              type="button"
              disabled={context.disabled}
              className={action}
              onClick={() => context.onRetry(mediaAssetId)}
            >
              {context.labels.retry}
            </button>
          ) : null}
          <button
            type="button"
            disabled={context.disabled}
            className={action}
            onClick={() => replacementInputRef.current?.click()}
          >
            {context.labels.replace}
          </button>
          <button
            type="button"
            disabled={context.disabled}
            className={action}
            onClick={() => context.onSetCover(mediaAssetId)}
          >
            {context.labels.setCover}
          </button>
          <button
            type="button"
            disabled={context.disabled && !failed}
            className={action}
            onClick={() => {
              if (context.disabled && !failed) return;
              editor.update(() => {
                const node = $getNodeByKey(nodeKey);
                node?.remove();
              });
              context.onRemove(blockId, mediaAssetId);
            }}
          >
            {context.labels.remove}
          </button>
          <input
            ref={replacementInputRef}
            type="file"
            accept={COMPOSER_PHOTO_ACCEPT}
            className="sr-only"
            disabled={context.disabled}
            aria-label={context.labels.replace}
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
