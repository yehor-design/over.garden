import process from "node:process";

import {
  buildCatalogFullImportDryRunReport,
  parseCatalogFullImportDryRunArgs,
  validateCatalogFullImportDryRunOptions,
} from "../src/lib/catalog/full-import-dry-run";

async function main() {
  const options = validateCatalogFullImportDryRunOptions(
    parseCatalogFullImportDryRunArgs(process.argv.slice(2)),
  );
  const report = buildCatalogFullImportDryRunReport({
    options,
    generatedAt: new Date().toISOString(),
  });

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
