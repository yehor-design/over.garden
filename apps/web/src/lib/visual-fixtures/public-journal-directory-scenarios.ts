import { tryResolveVisualFixtureEnvironment } from "./environment";

export type VisualFixturePublicJournalDirectoryMode =
  | "loading"
  | "error"
  | "corpus";

type SearchParams = Record<string, string | string[] | undefined>;
type EnvLike = Record<string, string | undefined>;

export function resolveVisualFixturePublicJournalDirectoryMode(
  searchParams: SearchParams,
  env: EnvLike,
): VisualFixturePublicJournalDirectoryMode | null {
  const mode = searchParams.__visualJournals;
  if (mode !== "loading" && mode !== "error" && mode !== "corpus") return null;
  return tryResolveVisualFixtureEnvironment(env) ? mode : null;
}
