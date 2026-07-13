"use client";

export async function runVisualJournalCreationScenario(scenarioId: string) {
  const response = await fetch("/api/__visual-fixtures/journal-creation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "run", scenarioId }),
  });
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
    postSavePath?: unknown;
  } | null;

  if (!response.ok) {
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : "Visual journal creation scenario failed.",
    );
  }

  if (typeof body?.postSavePath !== "string") {
    throw new Error("Visual journal creation scenario has no readback path.");
  }

  return body.postSavePath;
}
