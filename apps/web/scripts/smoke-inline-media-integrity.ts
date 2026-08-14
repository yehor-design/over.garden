import { runLexicalJournalBrowserProof } from "./lexical-journal-browser-proof";

const environment = argument("--environment") ?? "local";
const confirmation = argument("--confirm-environment");
if (environment !== "local" || confirmation !== "local") {
  throw new Error(
    "Inline-media browser proof requires explicit local confirmation.",
  );
}

void runLexicalJournalBrowserProof("media").catch(fail);

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(error: unknown) {
  console.error(
    error instanceof Error ? error.message : "Inline-media smoke failed.",
  );
  process.exitCode = 1;
}
