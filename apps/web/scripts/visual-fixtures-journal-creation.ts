import process from "node:process";

import { config as loadEnv } from "dotenv";

import { resolveVisualFixtureEnvironment } from "../src/lib/visual-fixtures/environment";
import { VISUAL_FIXTURE_MANIFEST } from "../src/lib/visual-fixtures/manifest";
import type { VisualJournalCreationEvidenceAction } from "../src/server/visual-fixtures/journal-creation-evidence";

loadEnv({ path: ".env.local", quiet: true });
let database: (typeof import("../src/db"))["db"] | null = null;

async function main() {
  resolveVisualFixtureEnvironment(process.env);
  const [databaseModule, evidenceModule] = await Promise.all([
    import("../src/db"),
    import("../src/server/visual-fixtures/journal-creation-evidence"),
  ]);
  database = databaseModule.db;
  const [actionValue = "verify", scenarioId = "all"] = process.argv
    .slice(2)
    .filter((argument) => argument !== "--");
  const action = normalizeAction(actionValue);
  const scenarios =
    scenarioId === "all"
      ? VISUAL_FIXTURE_MANIFEST.creationEvidence.scenarios
      : VISUAL_FIXTURE_MANIFEST.creationEvidence.scenarios.filter(
          (scenario) => scenario.id === scenarioId,
        );

  if (scenarios.length === 0) {
    throw new Error("No manifest-owned journal creation scenario matched.");
  }

  const results = [];
  for (const scenario of scenarios) {
    const result = await evidenceModule.executeVisualJournalCreationEvidence(
      action,
      scenario,
    );
    results.push({
      scenarioId: result.scenarioId,
      action: result.action,
      canonicalCreateCalls: result.canonicalCreateCalls,
      duplicateStable: result.duplicateStable,
      postSavePath: result.postSavePath,
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        action,
        scenarioCount: results.length,
        results,
      },
      null,
      2,
    ),
  );
}

function normalizeAction(value: string): VisualJournalCreationEvidenceAction {
  if (value === "reset" || value === "run" || value === "verify") {
    return value;
  }
  throw new Error("Action must be reset, run, or verify.");
}

void main()
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Journal creation evidence failed.",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await database?.destroy();
  });
