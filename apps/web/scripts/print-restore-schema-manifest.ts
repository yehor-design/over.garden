import { db } from "../src/db";
import { collectNormalizedSchemaManifestDigest } from "../src/server/restore-readiness";

async function main() {
  try {
    const digest = await collectNormalizedSchemaManifestDigest(db);
    console.log(
      JSON.stringify({ issue: "OVE-230", schemaManifestDigest: digest }),
    );
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "schema manifest failed",
  );
  process.exitCode = 1;
});
