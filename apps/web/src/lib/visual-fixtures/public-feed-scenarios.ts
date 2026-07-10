import { tryResolveVisualFixtureEnvironment } from "./environment";
import { VISUAL_FIXTURE_MANIFEST } from "./manifest";

import type {
  PublicFeedRequest,
  TrustedPublicFeedTopic,
} from "@/server/public-feed-repository";

export type VisualFixturePublicFeedMode =
  | "loading"
  | "error"
  | "page-2"
  | "exhausted"
  | "context-empty";

export interface VisualFixturePublicFeedScenario {
  mode: VisualFixturePublicFeedMode;
  requestOverride: PublicFeedRequest | null;
  hideTopics: boolean;
}

type SearchParams = Record<string, string | string[] | undefined>;
type EnvLike = Record<string, string | undefined>;

export function resolveVisualFixturePublicFeedScenario(
  searchParams: SearchParams,
  env: EnvLike,
): VisualFixturePublicFeedScenario | null {
  const mode = searchParams.__visualFeed;
  if (typeof mode !== "string") return null;
  if (!tryResolveVisualFixtureEnvironment(env)) return null;

  if (mode === "loading" || mode === "error") {
    return { mode, requestOverride: null, hideTopics: false };
  }

  if (mode === "context-empty") {
    return {
      mode,
      hideTopics: true,
      requestOverride: {
        cursor: null,
        kind: "all",
        topic: VISUAL_FIXTURE_MANIFEST.feedEvidence.denseTopicSlug,
      },
    };
  }

  if (mode !== "page-2" && mode !== "exhausted") return null;

  const cursor =
    mode === "page-2"
      ? VISUAL_FIXTURE_MANIFEST.feedEvidence.pageTwoCursor
      : VISUAL_FIXTURE_MANIFEST.feedEvidence.exhaustedCursor;

  return {
    mode,
    hideTopics: false,
    requestOverride: {
      cursor: { version: 1, ...cursor },
      kind: "all",
      topic: VISUAL_FIXTURE_MANIFEST.feedEvidence.denseTopicSlug,
    },
  };
}

export function filterVisualFixturePublicFeedTopics<
  T extends TrustedPublicFeedTopic,
>(topics: T[], env: EnvLike): T[] {
  if (!tryResolveVisualFixtureEnvironment(env)) return topics;

  const fixtureTopicSlugs = new Set(
    VISUAL_FIXTURE_MANIFEST.topics.map((topic) => topic.slug),
  );
  return topics.filter((topic) => fixtureTopicSlugs.has(topic.slug));
}
