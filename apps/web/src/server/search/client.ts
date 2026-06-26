import "server-only";

import { Meilisearch } from "meilisearch";

import { optionalServerEnv, requiredServerEnv } from "@/lib/env";

let cachedClient: Meilisearch | undefined;

export function meiliSearchClient(): Meilisearch {
  cachedClient ??= new Meilisearch({
    host: requiredServerEnv("MEILISEARCH_HOST"),
    apiKey: optionalServerEnv("MEILISEARCH_API_KEY"),
  });

  return cachedClient;
}
