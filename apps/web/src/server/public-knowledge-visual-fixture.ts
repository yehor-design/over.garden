import "server-only";

import { getPublicDerivativeUrl } from "@/lib/storage";
import { VISUAL_FIXTURE_MANIFEST } from "@/lib/visual-fixtures/manifest";
import { buildVisualFixtureKnowledgeCorpus } from "@/lib/visual-fixtures/public-knowledge-scenarios";
import type { PublicLocale } from "@/lib/public-localization";

export function loadVisualFixtureKnowledgeCorpus(locale: PublicLocale) {
  return buildVisualFixtureKnowledgeCorpus(
    VISUAL_FIXTURE_MANIFEST,
    locale,
    getPublicDerivativeUrl,
  );
}
