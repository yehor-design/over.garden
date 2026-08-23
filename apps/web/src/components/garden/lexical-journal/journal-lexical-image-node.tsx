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
  status:
    | "selected"
    | "decoding"
    | "encoding"
    | "staging"
    | "ready"
    | "failed";
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

  return (
    <div
      className="grid gap-2 rounded-md border border-border bg-muted/20 p-2"
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
          className="max-h-96 w-full rounded object-contain"
        />
      ) : (
        <div className="h-24 animate-pulse rounded bg-muted" aria-hidden="true" />
      )}

      {busy && context ? (
        <p className="text-sm text-muted-foreground" role="status">
          {context.labels.processing}
        </p>
      ) : null}
      {failed && context ? (
        <p id={`${inputId}-error`} className="text-sm text-destructive" role="alert">
          {context.labels.failed}
        </p>
      ) : null}

      {context ? (
        <div className="flex flex-wrap gap-2">
          {failed ? (
            <button
              type="button"
              disabled={context.disabled}
              className="min-h-11 rounded border border-border px-3 text-sm disabled:opacity-40"
              onClick={() => context.onRetry(mediaAssetId)}
            >
              {context.labels.retry}
            </button>
          ) : null}
          <button
            type="button"
            disabled={context.disabled}
            className="min-h-11 rounded border border-border px-3 text-sm disabled:opacity-40"
            onClick={() => replacementInputRef.current?.click()}
          >
            {context.labels.replace}
          </button>
          <button
            type="button"
            disabled={context.disabled}
            className="min-h-11 rounded border border-border px-3 text-sm disabled:opacity-40"
            onClick={() => context.onSetCover(mediaAssetId)}
          >
            {context.labels.setCover}
          </button>
          <button
            type="button"
            disabled={context.disabled && !failed}
            className="min-h-11 rounded border border-border px-3 text-sm disabled:opacity-40"
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
