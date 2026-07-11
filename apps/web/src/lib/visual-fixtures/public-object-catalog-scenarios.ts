import { tryResolveVisualFixtureEnvironment } from "./environment";

export type VisualFixturePublicObjectCatalogMode = "loading" | "error";

type SearchParams = Record<string, string | string[] | undefined>;
type EnvLike = Record<string, string | undefined>;

export function resolveVisualFixturePublicObjectCatalogMode(
  searchParams: SearchParams,
  env: EnvLike,
): VisualFixturePublicObjectCatalogMode | null {
  const mode = searchParams.__visualObjects;
  if (mode !== "loading" && mode !== "error") return null;
  return tryResolveVisualFixtureEnvironment(env) ? mode : null;
}
