export interface LexicalJournalFixtureSnapshot {
  blockCount: number;
  blockIds: string[];
  cancelCount: number;
  generation: number;
  imageCount: number;
  localeMutationInFlight: boolean;
  objectUrlCount: number;
  savedHash: string | null;
  semanticHash: string;
  types: string[];
}

export interface LexicalJournalFixtureController {
  cancel(): void;
  endComposition(): void;
  flush(): Promise<LexicalJournalFixtureSnapshot>;
  insertVoice(transcript: string): Promise<void>;
  move(blockId: string, delta: -1 | 1): Promise<"moved" | "noop">;
  snapshot(): LexicalJournalFixtureSnapshot;
  startLostComposition(): void;
  unmountComposer(): void;
}

declare global {
  interface Window {
    __ove317LexicalJournalFixture?: LexicalJournalFixtureController;
  }
}
