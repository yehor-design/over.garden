import { runLexicalJournalBrowserProof } from "./lexical-journal-browser-proof";

void runLexicalJournalBrowserProof("responsiveness").catch(fail);

function fail(error: unknown) {
  console.error(
    error instanceof Error
      ? error.message
      : "Journal responsiveness smoke failed.",
  );
  process.exitCode = 1;
}
