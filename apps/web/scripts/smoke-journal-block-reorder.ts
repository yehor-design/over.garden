import { runLexicalJournalBrowserProof } from "./lexical-journal-browser-proof";

void runLexicalJournalBrowserProof("reorder").catch(fail);

function fail(error: unknown) {
  console.error(
    error instanceof Error ? error.message : "Journal reorder smoke failed.",
  );
  process.exitCode = 1;
}
