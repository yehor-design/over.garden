import { tryResolveVisualFixtureEnvironment } from "./environment";
import {
  VISUAL_FIXTURE_MANIFEST,
  type VisualFixtureSocialScenario,
  type VisualFixtureSocialSurface,
} from "./manifest";

export function resolveVisualSocialScenario(
  value: string | string[] | null | undefined,
  surface: VisualFixtureSocialSurface,
  env: Record<string, string | undefined> = process.env,
): VisualFixtureSocialScenario | null {
  if (!tryResolveVisualFixtureEnvironment(env)) return null;
  const id = Array.isArray(value) ? value[0] : value;
  if (!id) return null;
  return (
    VISUAL_FIXTURE_MANIFEST.socialEvidence.scenarios.find(
      (scenario) => scenario.id === id && scenario.surface === surface,
    ) ?? null
  );
}
