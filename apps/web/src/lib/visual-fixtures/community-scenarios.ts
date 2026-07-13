import { tryResolveVisualFixtureEnvironment } from "./environment";
import {
  VISUAL_FIXTURE_MANIFEST,
  type VisualFixtureCommunityScenario,
} from "./manifest";

export function resolveVisualCommunityScenario(
  value: string | string[] | null | undefined,
  env: Record<string, string | undefined> = process.env,
): VisualFixtureCommunityScenario | null {
  if (!tryResolveVisualFixtureEnvironment(env)) return null;
  const id = Array.isArray(value) ? value[0] : value;
  if (!id) return null;
  return (
    VISUAL_FIXTURE_MANIFEST.communityEvidence.scenarios.find(
      (scenario) => scenario.id === id,
    ) ?? null
  );
}
