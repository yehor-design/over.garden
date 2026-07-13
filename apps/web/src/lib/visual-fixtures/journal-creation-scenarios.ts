import {
  tryResolveVisualFixtureEnvironment,
  type VisualFixtureEnvironment,
} from "@/lib/visual-fixtures/environment";
import {
  VISUAL_FIXTURE_MANIFEST,
  type VisualFixtureCreationFlow,
  type VisualFixtureCreationScenarioEvidence,
} from "@/lib/visual-fixtures/manifest";

type EnvLike = Record<string, string | undefined>;

export function resolveVisualJournalCreationScenario(
  value: string | string[] | undefined,
  flow: VisualFixtureCreationFlow,
  env: EnvLike,
): VisualFixtureCreationScenarioEvidence | null {
  const id = Array.isArray(value) ? value[0] : value;
  if (!id?.trim()) return null;

  const environment: VisualFixtureEnvironment | null =
    tryResolveVisualFixtureEnvironment(env);
  if (!environment) return null;

  return (
    VISUAL_FIXTURE_MANIFEST.creationEvidence.scenarios.find(
      (scenario) => scenario.id === id.trim() && scenario.flow === flow,
    ) ?? null
  );
}

export function resolveVisualJournalCreationResultScenario(
  value: string | string[] | undefined,
  objectId: string,
  env: EnvLike,
): VisualFixtureCreationScenarioEvidence | null {
  const id = Array.isArray(value) ? value[0] : value;
  if (!id?.trim() || !objectId.trim()) return null;

  const environment = tryResolveVisualFixtureEnvironment(env);
  if (!environment) return null;

  return (
    VISUAL_FIXTURE_MANIFEST.creationEvidence.scenarios.find(
      (scenario) =>
        scenario.id === id.trim() &&
        scenario.expectedServerWrite &&
        scenario.expectedObjectId === objectId,
    ) ?? null
  );
}
