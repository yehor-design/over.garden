import { runLexicalJournalBrowserProof } from "./lexical-journal-browser-proof";

void runLexicalJournalBrowserProof("matrix").catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Lexical browser matrix failed.",
  );
  process.exitCode = 1;
});
