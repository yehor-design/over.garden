import {
  tryResolveVisualFixtureEnvironment,
  type VisualFixtureEnvironment,
} from "@/lib/visual-fixtures/environment";
import {
  VISUAL_FIXTURE_MANIFEST,
  type VisualFixtureWorkspaceScenarioEvidence,
} from "@/lib/visual-fixtures/manifest";

type EnvLike = Record<string, string | undefined>;

export function resolveVisualGardenWorkspaceScenario(
  value: string | string[] | undefined,
  env: EnvLike,
): VisualFixtureWorkspaceScenarioEvidence | null {
  const state = Array.isArray(value) ? value[0] : value;
  if (!state?.trim()) return null;

  const environment: VisualFixtureEnvironment | null =
    tryResolveVisualFixtureEnvironment(env);
  if (!environment) return null;

  return (
    VISUAL_FIXTURE_MANIFEST.workspaceEvidence.scenarios.find(
      (scenario) => scenario.state === state.trim(),
    ) ?? null
  );
}
