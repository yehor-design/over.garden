import { runLexicalJournalBrowserProof } from "./lexical-journal-browser-proof";

void runLexicalJournalBrowserProof("structured").catch(fail);

function fail(error: unknown) {
  console.error(
    error instanceof Error ? error.message : "Structured journal smoke failed.",
  );
  process.exitCode = 1;
}
