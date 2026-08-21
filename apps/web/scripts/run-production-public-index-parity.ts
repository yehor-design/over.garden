import path from "node:path";
import { fileURLToPath } from "node:url";

import { runProductionPublicIndexParity } from "./production-public-index-parity-runner";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.dirname(scriptsDirectory);

process.exitCode = runProductionPublicIndexParity(process.argv.slice(2), {
  webRoot,
});
