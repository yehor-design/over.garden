"use client";

import { useEffect, useRef, useState } from "react";

import {
  StructuredJournalComposer,
  type StructuredJournalComposerHandle,
} from "@/components/garden/structured-journal-composer";
import {
  journalDocumentImageCount,
  semanticJournalDocumentHash,
  type JournalDocumentV1,
} from "@/lib/garden/journal-document";
import type {
  LexicalJournalFixtureController,
  LexicalJournalFixtureSnapshot,
} from "@/lib/garden/lexical-journal-browser-fixture-contract";
import { InlineMediaSelectionController } from "@/lib/garden/inline-media-selection-controller";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { interfaceLocaleChangeCoordinator } from "@/lib/interface-locale-change-coordinator";
import { getStructuredJournalComposerLabels } from "@/lib/structured-journal-composer-copy";

const COPY: Record<InterfaceLocale, { cancel: string; heading: string }> = {
  uk: { cancel: "Скасувати синтетичну чернетку", heading: "Стенд Lexical" },
  bg: { cancel: "Отказ на синтетичната чернова", heading: "Lexical стенд" },
  ru: { cancel: "Отменить синтетический черновик", heading: "Стенд Lexical" },
};

export function LexicalJournalVisualFixture({
  locale,
  dense,
}: {
  locale: InterfaceLocale;
  dense: boolean;
}) {
  const [initialDocument] = useState(() => createFixtureDocument(dense));
  const documentRef = useRef(initialDocument);
  const composerRef = useRef<StructuredJournalComposerHandle | null>(null);
  const [inlineMedia] = useState(() => new InlineMediaSelectionController());
  const urlsRef = useRef(new Map<string, string>());
  const generationRef = useRef(0);
  const cancelCountRef = useRef(0);
  const [journalDocument, setJournalDocument] = useState(initialDocument);
  const [generation, setGeneration] = useState(0);
  const [savedHash, setSavedHash] = useState<string | null>(null);
  const [cancelCount, setCancelCount] = useState(0);
  const [composerMounted, setComposerMounted] = useState(true);
  const labels = getStructuredJournalComposerLabels(locale);

  function snapshot(): LexicalJournalFixtureSnapshot {
    const current = documentRef.current;
    return {
      blockCount: current.blocks.length,
      blockIds: current.blocks.map((block) => block.id),
      cancelCount: cancelCountRef.current,
      generation: generationRef.current,
      imageCount: journalDocumentImageCount(current),
      localeMutationInFlight:
        interfaceLocaleChangeCoordinator.readState().hasInFlightMutation,
      objectUrlCount: inlineMedia.snapshot().objectUrlCount,
      savedHash,
      semanticHash: semanticJournalDocumentHash(current),
      types: current.blocks.map((block) => block.type),
    };
  }

  useEffect(() => {
    const controller: LexicalJournalFixtureController = {
      cancel() {
        cancelCountRef.current += 1;
        setCancelCount(cancelCountRef.current);
      },
      endComposition() {
        window.document
          .querySelector<HTMLElement>("[contenteditable='true']")
          ?.dispatchEvent(
            new CompositionEvent("compositionend", { bubbles: true }),
          );
      },
      async flush() {
        await composerRef.current?.flushLatest();
        return snapshot();
      },
      async insertVoice(transcript) {
        await composerRef.current?.insertVoiceTranscript(transcript);
      },
      async move(blockId, delta) {
        return (
          (await composerRef.current?.moveBlockById(blockId, delta)) ?? "noop"
        );
      },
      snapshot,
      startLostComposition() {
        window.document
          .querySelector<HTMLElement>("[contenteditable='true']")
          ?.dispatchEvent(
            new CompositionEvent("compositionstart", { bubbles: true }),
          );
      },
      unmountComposer() {
        setComposerMounted(false);
      },
    };
    window.__ove317LexicalJournalFixture = controller;
    return () => {
      if (window.__ove317LexicalJournalFixture === controller) {
        delete window.__ove317LexicalJournalFixture;
      }
    };
  });

  useEffect(
    () => () => {
      inlineMedia.destroy();
      urlsRef.current.clear();
    },
    [inlineMedia],
  );

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-4xl gap-5 p-4 sm:p-8">
      <header className="grid gap-1">
        <p className="text-xs font-medium text-muted-foreground uppercase">
          OVE-317 synthetic browser evidence
        </p>
        <h1 className="text-2xl font-semibold">{COPY[locale].heading}</h1>
      </header>
      {composerMounted ? (
        <StructuredJournalComposer
          locale={locale}
          labels={labels}
          initialDocument={initialDocument}
          composerRef={composerRef}
          onDocumentChange={(next, meta) => {
            documentRef.current = next;
            generationRef.current = meta.generation;
            setJournalDocument(next);
            setGeneration(meta.generation);
          }}
          onSelectImageFile={async (file, blockId) => {
            const reservation = inlineMedia.reserve(file, {});
            try {
              if (file.name.startsWith("slow-")) {
                await new Promise((resolve) => window.setTimeout(resolve, 100));
              }
              const mediaAssetId = crypto.randomUUID();
              const previewUrl = URL.createObjectURL(file);
              inlineMedia.commit(reservation, blockId, previewUrl);
              urlsRef.current.set(blockId, previewUrl);
              return { mediaAssetId, previewUrl };
            } catch (error) {
              inlineMedia.release(reservation);
              throw error;
            }
          }}
          onRemoveImageBlock={(blockId) => {
            inlineMedia.revoke(blockId);
            urlsRef.current.delete(blockId);
          }}
        />
      ) : (
        <p data-lexical-fixture-unmounted="true">
          Synthetic composer unmounted.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="min-h-11 rounded border border-border px-4"
          data-lexical-fixture-save="true"
          onClick={() => {
            void composerRef.current?.flushLatest().then((flushed) => {
              if (flushed) setSavedHash(semanticJournalDocumentHash(flushed));
            });
          }}
        >
          {labels.saveLabel}
        </button>
        <button
          type="button"
          className="min-h-11 rounded border border-border px-4"
          data-lexical-fixture-cancel="true"
          onClick={() => {
            cancelCountRef.current += 1;
            setCancelCount(cancelCountRef.current);
          }}
        >
          {COPY[locale].cancel}
        </button>
      </div>
      <output
        className="text-xs text-muted-foreground"
        data-lexical-fixture-receipt="true"
      >
        blocks={journalDocument.blocks.length}; images=
        {journalDocumentImageCount(journalDocument)}; generation={generation};
        cancels=
        {cancelCount}; saved=
        {savedHash ? "yes" : "no"}
      </output>
    </main>
  );
}

function createFixtureDocument(dense: boolean): JournalDocumentV1 {
  const count = dense ? 100 : 6;
  return {
    schemaVersion: 1,
    blocks: Array.from({ length: count }, (_, index) => {
      if (dense && index < 10) {
        return {
          id: `synthetic-image-${index + 1}`,
          type: "image" as const,
          mediaAssetId: `31700000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        };
      }
      return {
        id: `synthetic-paragraph-${index + 1}`,
        type: "paragraph" as const,
        spans: [{ text: `Синтетичний абзац ${index + 1}` }],
      };
    }),
  };
}
