"use client";

import { useEffect } from "react";

import { BrowserJournalImageEncoder } from "@/lib/media/browser-journal-image-encoder";

interface AtomicJournalCodecFixtureResult {
  bytesBase64: string;
  width: number;
  height: number;
  sha256: string;
  sourceKind: string;
  lossless: boolean;
  quality: number;
}

declare global {
  interface Window {
    __ove347AtomicJournalCodecFixture?: {
      encode(input: {
        bytesBase64: string;
        mediaType: string;
      }): Promise<AtomicJournalCodecFixtureResult>;
    };
  }
}

export function AtomicJournalCodecFixture() {
  useEffect(() => {
    const controller = {
      async encode(input: { bytesBase64: string; mediaType: string }) {
        const sourceBytes = base64ToBytes(input.bytesBase64);
        const encoded = await new BrowserJournalImageEncoder().encode({
          source: new Blob([sourceBytes], { type: input.mediaType }),
          mediaAssetId: crypto.randomUUID(),
          generation: 1,
          signal: new AbortController().signal,
          onPhase: () => undefined,
        });
        const bytes = new Uint8Array(await encoded.blob.arrayBuffer());
        return {
          bytesBase64: bytesToBase64(bytes),
          width: encoded.width,
          height: encoded.height,
          sha256: encoded.sha256,
          sourceKind: encoded.sourceKind,
          lossless: encoded.lossless,
          quality: encoded.quality,
        };
      },
    };
    window.__ove347AtomicJournalCodecFixture = controller;
    return () => {
      if (window.__ove347AtomicJournalCodecFixture === controller) {
        delete window.__ove347AtomicJournalCodecFixture;
      }
    };
  }, []);

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-2xl content-center gap-3 p-6">
      <p className="text-xs font-medium text-muted-foreground uppercase">
        OVE-347 synthetic codec evidence
      </p>
      <h1 className="text-2xl font-semibold">Atomic journal codec fixture</h1>
      <p data-atomic-journal-codec-ready="true">
        Local and preview only. No source bytes leave this browser page.
      </p>
    </main>
  );
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}
