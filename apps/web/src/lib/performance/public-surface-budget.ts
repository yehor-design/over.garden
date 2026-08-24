import type { PublicSurfaceDiscoveryConsumerId } from "@/server/public-surface-discovery";

export const PUBLIC_SURFACE_PERFORMANCE_CLASSES = [
  "feed",
  "journal_directory",
  "journal_entry",
  "profile",
  "knowledge",
  "catalog",
  "community",
  "object_passport",
] as const;

export type PublicSurfacePerformanceClass =
  (typeof PUBLIC_SURFACE_PERFORMANCE_CLASSES)[number];

export interface PublicSurfaceCoreWebVitalsBudget {
  lcpMs: number;
  inpMs: number;
  cls: number;
  reason: string;
}

const GOOD_CORE_WEB_VITALS = {
  lcpMs: 2_500,
  inpMs: 200,
  cls: 0.1,
} as const;

function budget(reason: string): PublicSurfaceCoreWebVitalsBudget {
  return { ...GOOD_CORE_WEB_VITALS, reason };
}

export const PUBLIC_SURFACE_BUDGET = {
  feed: budget(
    "The public feed is the first discovery surface and must reach useful content before a constrained mobile visitor abandons it.",
  ),
  journal_directory: budget(
    "The journal directory is a discovery list whose controls and first results must remain responsive on constrained mobile hardware.",
  ),
  journal_entry: budget(
    "A public journal is the primary gardener-authored reading surface and must not trade narrative or media for delayed first value.",
  ),
  profile: budget(
    "A public profile is the trust bridge into a gardener's published work and must render without delayed identity context or layout movement.",
  ),
  knowledge: budget(
    "Editorial, guide, answer, market, and topic pages share the knowledge reading archetype and must remain fast enough for search arrivals.",
  ),
  catalog: budget(
    "Catalog and variety discovery are scan-heavy surfaces whose first useful results and filters must remain responsive on mobile.",
  ),
  community: budget(
    "Community discovery and detail pages are navigation-heavy public surfaces and must not delay the first safe participation context.",
  ),
  object_passport: budget(
    "Object passports combine identity, provenance, and timeline content and must preserve stable first rendering despite their density.",
  ),
} as const satisfies Record<
  PublicSurfacePerformanceClass,
  PublicSurfaceCoreWebVitalsBudget
>;

export const PUBLIC_SURFACE_PERFORMANCE_CONSUMER_CLASS = {
  localized_home: "feed",
  localized_journals_directory: "journal_directory",
  localized_journal_entry: "journal_entry",
  localized_profile: "profile",
  localized_blog_index: "knowledge",
  localized_blog_post: "knowledge",
  localized_guide: "knowledge",
  localized_answer: "knowledge",
  localized_knowledge_hub: "knowledge",
  localized_market: "knowledge",
  localized_catalog_browse: "catalog",
  localized_topic: "knowledge",
  localized_community_directory: "community",
  localized_community: "community",
  catalog_evidence: "catalog",
  lineage_object: "object_passport",
  authored_sitemap: "knowledge",
  variety_sitemap: "catalog",
  topic_sitemap: "knowledge",
  public_variety_repository: "catalog",
  public_topic_repository: "knowledge",
} as const satisfies Partial<
  Record<PublicSurfaceDiscoveryConsumerId, PublicSurfacePerformanceClass>
>;

export const PUBLIC_SURFACE_NON_CANDIDATE_CONSUMERS = [
  "privacy",
  "first_publication_disclosure",
] as const satisfies readonly PublicSurfaceDiscoveryConsumerId[];

export const PUBLIC_SURFACE_PERFORMANCE_TARGETS = [
  target("feed", "main:ove187-feed-typical"),
  target("journal_directory", "main:ove187-journal-directory-plus-one"),
  target("journal_entry", "journal-entry:recent-mixed-gallery"),
  target("profile", "profile:gardener-dense"),
  target("knowledge", "main:ove187-knowledge-guide-dense"),
  target("catalog", "main:ove187-catalog-page-size-plus-one"),
  target("community", "community:ove184-community-typical"),
  target("object_passport", "passport:public-plant-dense"),
] as const;

function target(
  surfaceClass: PublicSurfacePerformanceClass,
  scenarioId: string,
) {
  return {
    surfaceClass,
    scenarioId,
    interactionSelector: '[data-cwv-interaction-target="site-menu"]',
  } as const;
}

export const PUBLIC_SURFACE_CWV_PROFILE = {
  browser: "chromium",
  viewport: { width: 390, height: 844 },
  cpuSlowdownMultiplier: 4,
  latencyMs: 40,
  downloadBytesPerSecond: (10 * 1024 * 1024) / 8,
  uploadBytesPerSecond: (2 * 1024 * 1024) / 8,
  serviceWorkers: "block",
  cache: "disabled",
  runsPerClass: 5,
  percentile: 0.75,
  eventObserverFloorMs: 16,
} as const;

export const PUBLIC_SURFACE_CWV_CLASS_DEADLINE_MS = 120_000;

