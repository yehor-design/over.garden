import { createHash } from "node:crypto";

import {
  buildAuthIntentResumeHref,
  normalizeAuthIntentDraft,
  type AuthIntentAction,
  type AuthIntentTarget,
} from "@/lib/auth/auth-intent-contract";

export const VISUAL_FIXTURE_MANIFEST_VERSION = "ove187-v2";
export const VISUAL_FIXTURE_NAMESPACE =
  `visual-fixtures/${VISUAL_FIXTURE_MANIFEST_VERSION}` as const;

export type VisualFixtureLocale = "uk" | "bg" | "ru";
export type VisualFixtureObjectKind = "plant" | "animal" | "bee_colony";
export type VisualFixtureCatalogKind = "plant_variety" | "species" | "breed";
export type VisualFixtureCatalogStatus =
  | "seeded"
  | "confirmed"
  | "provisional"
  | "merged"
  | "rejected";
export type VisualFixtureCatalogLocale = VisualFixtureLocale | "en" | "la";
export type VisualFixtureVarietyState =
  | "selected"
  | "unknown"
  | "user_added"
  | "free_text";
export type VisualFixtureVisibility = "private" | "public";
export type VisualFixtureLifecycleState = "active" | "archived";
export type VisualFixtureMediaAspect =
  | "square"
  | "landscape_4_3"
  | "portrait_3_4"
  | "wide_16_9";
export type VisualFixtureScenarioKind =
  | "fixture-index"
  | "public-feed-empty"
  | "public-feed-typical"
  | "public-feed-dense"
  | "public-feed-loading"
  | "public-feed-error"
  | "public-feed-pagination"
  | "public-feed-exhausted"
  | "public-feed-context-empty"
  | "public-catalog-empty"
  | "public-catalog-zero-results"
  | "public-catalog-sparse"
  | "public-catalog-page-size-minus-one"
  | "public-catalog-page-size"
  | "public-catalog-page-size-plus-one"
  | "public-catalog-pagination"
  | "public-catalog-combined-filters"
  | "public-catalog-search-alias"
  | "public-catalog-unavailable"
  | "public-catalog-loading"
  | "public-catalog-error"
  | "public-catalog-variety"
  | "public-catalog-species"
  | "public-catalog-breed"
  | "public-journal-directory-default"
  | "public-journal-directory-page-size-minus-one"
  | "public-journal-directory-page-size"
  | "public-journal-directory-page-size-plus-one"
  | "public-journal-directory-pagination"
  | "public-journal-directory-combined-filters"
  | "public-journal-directory-zero-results"
  | "public-journal-directory-corrected-query"
  | "public-journal-directory-loading"
  | "public-journal-directory-error"
  | "public-journal-directory-exhausted"
  | "public-journal-active"
  | "public-journal-gone"
  | "public-journal-missing"
  | "public-object-empty"
  | "public-object-typical"
  | "public-object-dense"
  | "public-profile"
  | "media-gallery";
export type VisualFixtureStateKind =
  | "empty-space"
  | "empty-object"
  | "today-journal"
  | "owner-only-journal"
  | "archived-journal"
  | "maximum-copy"
  | "no-media-journal"
  | "one-media-journal"
  | "media-gallery"
  | "feed-empty"
  | "feed-typical"
  | "feed-dense"
  | "feed-loading"
  | "feed-error"
  | "feed-pagination"
  | "feed-exhausted"
  | "feed-context-empty";

export interface VisualFixtureActor {
  id: string;
  handle: string;
  displayName: string;
  email: string;
  locale: VisualFixtureLocale;
  role: "gardener" | "apartment_keeper" | "animal_keeper" | "beekeeper";
  createdAt: string;
}

export interface VisualFixtureSpace {
  id: string;
  ownerUserId: string;
  displayName: string;
  locationVisibility: "hidden" | "region";
  coarseRegionCode: string | null;
  createdAt: string;
}

export interface VisualFixtureObject {
  id: string;
  ownerUserId: string;
  spaceId: string;
  displayName: string;
  objectKind: VisualFixtureObjectKind;
  catalogItemId: string | null;
  varietyText: string | null;
  varietyState: VisualFixtureVarietyState;
  locationVisibility: "hidden" | "region";
  coarseRegionCode: string | null;
  createdAt: string;
}

export interface VisualFixtureCatalogItem {
  id: string;
  canonicalName: string;
  normalizedName: string;
  publicSlug: string;
  catalogKind: VisualFixtureCatalogKind;
  status: VisualFixtureCatalogStatus;
  source: "visual_fixture";
  sourceId: string;
  locale: VisualFixtureCatalogLocale;
  createdAt: string;
}

export interface VisualFixtureCatalogName {
  id: string;
  catalogItemId: string;
  displayName: string;
  normalizedName: string;
  locale: VisualFixtureCatalogLocale;
  isPrimary: boolean;
  createdAt: string;
}

export interface VisualFixtureEntry {
  id: string;
  ownerUserId: string;
  spaceId: string;
  objectId: string;
  locale: VisualFixtureLocale;
  title: string;
  body: string;
  entryDate: string;
  visibility: VisualFixtureVisibility;
  lifecycleState: VisualFixtureLifecycleState;
  publicSlug: string | null;
  publicNoindex: true;
  publishedAt: string | null;
  archivedAt: string | null;
  publicGoneAt: string | null;
  firstPublicationDisclosureVersion: string | null;
  firstPublicationDisclosedAt: string | null;
  clientMutationId: string;
  createdAt: string;
}

export interface VisualFixtureMedia {
  id: string;
  ownerUserId: string;
  entryId: string;
  fileName: string;
  localPath: string;
  quarantineKey: string;
  derivativeKey: string;
  contentType: "image/png";
  aspect: VisualFixtureMediaAspect;
  width: number;
  height: number;
  sha256: string;
  altText: string;
  createdAt: string;
}

export interface VisualFixtureTopic {
  id: string;
  slug: string;
  label: string;
  trustState: "curated";
  createdAt: string;
}

export interface VisualFixtureTopicSignal {
  journalEntryId: string;
  topicId: string;
  signalSource: "operator_curated";
  reviewState: "accepted";
  publicMembershipState: "eligible";
  createdAt: string;
}

export interface VisualFixtureFeedCursorAnchor {
  id: string;
  publishedAt: string;
}

export interface VisualFixtureFeedEvidence {
  pageSize: 8;
  typicalTopicSlug: string;
  denseTopicSlug: string;
  emptyTopicSlug: string;
  galleryEntryId: string;
  pageTwoCursor: VisualFixtureFeedCursorAnchor;
  exhaustedCursor: VisualFixtureFeedCursorAnchor;
}

export interface VisualFixtureJournalDirectoryQueryEvidence {
  id: string;
  label: string;
  path: string;
  expectedCount: number;
  expectedOrderedEntryIds: readonly string[];
  expectedOrderedPublicSlugs: readonly string[];
}

export interface VisualFixtureJournalDirectoryEvidence {
  pageSize: 8;
  authoredLocales: readonly VisualFixtureLocale[];
  safeRegionCodes: readonly string[];
  hiddenRegionEntryCount: number;
  queries: readonly VisualFixtureJournalDirectoryQueryEvidence[];
}

export interface VisualFixtureScenario {
  id: string;
  kind: VisualFixtureScenarioKind;
  label: string;
  path: string;
  expectedStatus: 200 | 404 | 410;
  expectedUiState?: "not_found";
  viewportTargets: readonly ("desktop" | "mobile-320")[];
}

export type VisualFixtureIntentState =
  | "guest"
  | "already_authenticated"
  | "cancel"
  | "expired"
  | "invalid"
  | "deleted_410"
  | "now_private"
  | "insufficient_permission"
  | "draft_retained";

export interface VisualFixtureIntentScenario {
  id: string;
  action: AuthIntentAction;
  label: string;
  state: VisualFixtureIntentState;
  returnTo: string;
  target?: AuthIntentTarget;
  startPath: string;
  resumePath: string;
  tokenMode: "valid" | "expired" | "invalid";
  draftKind?: "first_entry" | "follow_up_entry";
  expectedStatus: 200 | 404 | 410;
  viewportTargets: readonly ("desktop" | "mobile-320")[];
}

export interface VisualFixtureIntentEvidence {
  scenarios: readonly VisualFixtureIntentScenario[];
}

export interface VisualFixtureLineagePendingIdentity {
  id: string;
  createdByUserId: string;
  displayLabel: string;
  createdAt: string;
}

export interface VisualFixtureLineageEdge {
  id: string;
  ownerUserId: string;
  subjectObjectId: string;
  sourcePendingIdentityId: string;
  clientMutationId: string;
  createdAt: string;
}

export interface VisualFixtureLineageEvidence {
  pendingIdentities: readonly VisualFixtureLineagePendingIdentity[];
  edges: readonly VisualFixtureLineageEdge[];
  claimPendingIdentityId: string;
  claimEdgeId: string;
}

export interface VisualFixtureStateCoverage {
  id: string;
  kind: VisualFixtureStateKind;
  label: string;
  detail: string;
  count: number;
  access: "public" | "owner";
  path: string | null;
}

export interface VisualFixtureManifest {
  version: typeof VISUAL_FIXTURE_MANIFEST_VERSION;
  namespace: typeof VISUAL_FIXTURE_NAMESPACE;
  actors: readonly VisualFixtureActor[];
  spaces: readonly VisualFixtureSpace[];
  catalogItems: readonly VisualFixtureCatalogItem[];
  catalogNames: readonly VisualFixtureCatalogName[];
  objects: readonly VisualFixtureObject[];
  entries: readonly VisualFixtureEntry[];
  media: readonly VisualFixtureMedia[];
  topics: readonly VisualFixtureTopic[];
  topicSignals: readonly VisualFixtureTopicSignal[];
  feedEvidence: VisualFixtureFeedEvidence;
  journalDirectoryEvidence: VisualFixtureJournalDirectoryEvidence;
  lineageEvidence: VisualFixtureLineageEvidence;
  intentEvidence: VisualFixtureIntentEvidence;
  stateCoverage: readonly VisualFixtureStateCoverage[];
  scenarios: readonly VisualFixtureScenario[];
}

const CREATED_AT_BASE = "2026-01-05T09:00:00.000Z";
const CATALOG_IDS = {
  tomatoVariety: fixtureUuid(9, 1),
  cucumberVariety: fixtureUuid(9, 2),
  bgTomatoVariety: fixtureUuid(9, 3),
  rosemarySpecies: fixtureUuid(9, 4),
  monsteraSpecies: fixtureUuid(9, 5),
  calatheaSpecies: fixtureUuid(9, 6),
  lemonSpecies: fixtureUuid(9, 7),
  lavenderSpecies: fixtureUuid(9, 8),
  sunflowerSpecies: fixtureUuid(9, 9),
  strawberrySpecies: fixtureUuid(9, 10),
  localGoatBreed: fixtureUuid(9, 11),
  bulgarianGoatBreed: fixtureUuid(9, 12),
  rhodeIslandBreed: fixtureUuid(9, 13),
  longBantamBreed: fixtureUuid(9, 14),
  domesticShorthairBreed: fixtureUuid(9, 15),
  mixedDogBreed: fixtureUuid(9, 16),
  carpathianBeeBreed: fixtureUuid(9, 17),
  honeyBeeSpecies: fixtureUuid(9, 18),
  unavailableRabbitSpecies: fixtureUuid(9, 19),
} as const;

interface CatalogSeedSpec {
  id: string;
  canonicalName: string;
  publicSlug: string;
  catalogKind: VisualFixtureCatalogKind;
  locale: VisualFixtureCatalogLocale;
  status?: VisualFixtureCatalogStatus;
}

const catalogSeedSpecs: readonly CatalogSeedSpec[] = [
  catalogSeed(
    CATALOG_IDS.tomatoVariety,
    "Помідор чері",
    "visual-pomidor-cheri",
    "plant_variety",
    "uk",
  ),
  catalogSeed(
    CATALOG_IDS.cucumberVariety,
    "Огірок Ніжинський",
    "visual-nizhyn-cucumber",
    "plant_variety",
    "uk",
  ),
  catalogSeed(
    CATALOG_IDS.bgTomatoVariety,
    "Домат чери",
    "visual-domat-cheri",
    "plant_variety",
    "bg",
  ),
  catalogSeed(
    CATALOG_IDS.rosemarySpecies,
    "Rosmarinus officinalis",
    "visual-rosmarinus-officinalis",
    "species",
    "la",
  ),
  catalogSeed(
    CATALOG_IDS.monsteraSpecies,
    "Monstera deliciosa",
    "visual-monstera-deliciosa",
    "species",
    "la",
  ),
  catalogSeed(
    CATALOG_IDS.calatheaSpecies,
    "Goeppertia orbifolia",
    "visual-goeppertia-orbifolia",
    "species",
    "la",
  ),
  catalogSeed(
    CATALOG_IDS.lemonSpecies,
    "Citrus limon",
    "visual-citrus-limon",
    "species",
    "la",
  ),
  catalogSeed(
    CATALOG_IDS.lavenderSpecies,
    "Lavandula angustifolia",
    "visual-lavandula-angustifolia",
    "species",
    "la",
  ),
  catalogSeed(
    CATALOG_IDS.sunflowerSpecies,
    "Helianthus annuus",
    "visual-helianthus-annuus",
    "species",
    "la",
  ),
  catalogSeed(
    CATALOG_IDS.strawberrySpecies,
    "Fragaria x ananassa",
    "visual-fragaria-ananassa",
    "species",
    "la",
  ),
  catalogSeed(
    CATALOG_IDS.localGoatBreed,
    "Українська місцева коза",
    "visual-ukrainian-local-goat",
    "breed",
    "uk",
  ),
  catalogSeed(
    CATALOG_IDS.bulgarianGoatBreed,
    "Българска бяла млечна коза",
    "visual-bulgarian-white-dairy-goat",
    "breed",
    "bg",
  ),
  catalogSeed(
    CATALOG_IDS.rhodeIslandBreed,
    "Rhode Island Red",
    "visual-rhode-island-red",
    "breed",
    "en",
  ),
  catalogSeed(
    CATALOG_IDS.longBantamBreed,
    "Бельгійська бородата бентамка д'Уккле, порцелянова кольорова лінія",
    "visual-belgian-bearded-bantam-porcelain-line",
    "breed",
    "uk",
  ),
  catalogSeed(
    CATALOG_IDS.domesticShorthairBreed,
    "Domestic Shorthair",
    "visual-domestic-shorthair",
    "breed",
    "en",
  ),
  catalogSeed(
    CATALOG_IDS.mixedDogBreed,
    "Mixed-breed dog",
    "visual-mixed-breed-dog",
    "breed",
    "en",
  ),
  catalogSeed(
    CATALOG_IDS.carpathianBeeBreed,
    "Карпатська бджола",
    "visual-karpatska-bdzhola",
    "breed",
    "uk",
  ),
  catalogSeed(
    CATALOG_IDS.honeyBeeSpecies,
    "Apis mellifera",
    "visual-apis-mellifera",
    "species",
    "la",
  ),
  catalogSeed(
    CATALOG_IDS.unavailableRabbitSpecies,
    "Oryctolagus cuniculus",
    "visual-oryctolagus-cuniculus-unavailable",
    "species",
    "la",
    "rejected",
  ),
];

const catalogItems: readonly VisualFixtureCatalogItem[] = catalogSeedSpecs.map(
  (spec, offset) => ({
    ...spec,
    normalizedName: normalizeCatalogName(spec.canonicalName),
    status: spec.status ?? "seeded",
    source: "visual_fixture",
    sourceId: `ove175-visual-${String(offset + 1).padStart(2, "0")}`,
    createdAt: timestampForIndex(500 + offset),
  }),
);

const catalogAliasSpecs: readonly Omit<
  VisualFixtureCatalogName,
  "id" | "normalizedName" | "isPrimary" | "createdAt"
>[] = [
  {
    catalogItemId: CATALOG_IDS.tomatoVariety,
    displayName: "Cherry tomato",
    locale: "en",
  },
  {
    catalogItemId: CATALOG_IDS.cucumberVariety,
    displayName: "Ніжинський огірок",
    locale: "uk",
  },
  {
    catalogItemId: CATALOG_IDS.bgTomatoVariety,
    displayName: "Чери домат",
    locale: "bg",
  },
  {
    catalogItemId: CATALOG_IDS.rosemarySpecies,
    displayName: "Розмарин лікарський",
    locale: "uk",
  },
  {
    catalogItemId: CATALOG_IDS.monsteraSpecies,
    displayName: "Монстера делициоза",
    locale: "bg",
  },
  {
    catalogItemId: CATALOG_IDS.calatheaSpecies,
    displayName: "Калатея орбіфолія",
    locale: "uk",
  },
  {
    catalogItemId: CATALOG_IDS.lavenderSpecies,
    displayName: "Теснолистна лавандула",
    locale: "bg",
  },
  {
    catalogItemId: CATALOG_IDS.carpathianBeeBreed,
    displayName: "Карпатская пчела",
    locale: "ru",
  },
  {
    catalogItemId: CATALOG_IDS.honeyBeeSpecies,
    displayName: "Медоносная пчела",
    locale: "ru",
  },
  {
    catalogItemId: CATALOG_IDS.unavailableRabbitSpecies,
    displayName: "Європейський кріль",
    locale: "uk",
  },
];

const catalogNames: readonly VisualFixtureCatalogName[] = [
  ...catalogItems.map((item, offset) => ({
    id: fixtureUuid(9, 101 + offset),
    catalogItemId: item.id,
    displayName: item.canonicalName,
    normalizedName: item.normalizedName,
    locale: item.locale,
    isPrimary: true,
    createdAt: timestampForIndex(550 + offset),
  })),
  ...catalogAliasSpecs.map((alias, offset) => ({
    ...alias,
    id: fixtureUuid(9, 201 + offset),
    normalizedName: normalizeCatalogName(alias.displayName),
    isPrimary: false,
    createdAt: timestampForIndex(600 + offset),
  })),
];

const actors: readonly VisualFixtureActor[] = [
  {
    id: fixtureUuid(1, 1),
    handle: "demo_olena",
    displayName: "Олена, теплична практикиня",
    email: "olena@visual-fixtures.invalid",
    locale: "uk",
    role: "gardener",
    createdAt: CREATED_AT_BASE,
  },
  {
    id: fixtureUuid(1, 2),
    handle: "demo_mariya",
    displayName: "Мария, градски растения",
    email: "mariya@visual-fixtures.invalid",
    locale: "bg",
    role: "apartment_keeper",
    createdAt: CREATED_AT_BASE,
  },
  {
    id: fixtureUuid(1, 3),
    handle: "demo_danylo",
    displayName: "Данило, догляд за тваринами",
    email: "danylo@visual-fixtures.invalid",
    locale: "uk",
    role: "animal_keeper",
    createdAt: CREATED_AT_BASE,
  },
  {
    id: fixtureUuid(1, 4),
    handle: "demo_nikolay",
    displayName: "Николай, пасека и наблюдения",
    email: "nikolay@visual-fixtures.invalid",
    locale: "ru",
    role: "beekeeper",
    createdAt: CREATED_AT_BASE,
  },
];

const spaces: readonly VisualFixtureSpace[] = [
  createSpace(1, actors[1], "Балкон след зимната пауза", "hidden", null),
  createSpace(2, actors[0], "Теплиця і сезонні грядки", "region", "UA-30"),
  createSpace(
    3,
    actors[1],
    "Градска джунгла с дълго име за проверка на пренасянето",
    "region",
    "BG-22",
  ),
  createSpace(
    4,
    actors[2],
    "Подвір'я для тварин і відновлення",
    "hidden",
    null,
  ),
  createSpace(5, actors[3], "Пасека на склоне", "region", "BG-23"),
];

interface ObjectSeedSpec {
  displayName: string;
  objectKind: VisualFixtureObjectKind;
  spaceIndex: number;
  catalogItemId?: string;
  varietyText?: string;
  varietyState: VisualFixtureVarietyState;
}

const objectSeedSpecs: readonly ObjectSeedSpec[] = [
  {
    displayName: "Черрі біля південної стінки",
    objectKind: "plant",
    spaceIndex: 2,
    catalogItemId: CATALOG_IDS.tomatoVariety,
    varietyState: "selected",
  },
  {
    displayName: "Ніжинський огірок на шпалері",
    objectKind: "plant",
    spaceIndex: 2,
    catalogItemId: CATALOG_IDS.cucumberVariety,
    varietyState: "selected",
  },
  {
    displayName: "Базилік для щотижневого зрізання",
    objectKind: "plant",
    spaceIndex: 2,
    varietyText: "Генуезький ароматний",
    varietyState: "free_text",
  },
  {
    displayName: "Перець після холодної ночі",
    objectKind: "plant",
    spaceIndex: 2,
    varietyText: "Ранній червоний",
    varietyState: "user_added",
  },
  {
    displayName: "Салат у затіненому кутку",
    objectKind: "plant",
    spaceIndex: 2,
    varietyState: "unknown",
  },
  {
    displayName: "Розмарин у великому контейнері",
    objectKind: "plant",
    spaceIndex: 3,
    catalogItemId: CATALOG_IDS.rosemarySpecies,
    varietyText: "Rosmarinus officinalis",
    varietyState: "selected",
  },
  {
    displayName: "Домати за балконската решетка",
    objectKind: "plant",
    spaceIndex: 3,
    catalogItemId: CATALOG_IDS.bgTomatoVariety,
    varietyState: "selected",
  },
  {
    displayName: "Монстера до прозореца",
    objectKind: "plant",
    spaceIndex: 3,
    catalogItemId: CATALOG_IDS.monsteraSpecies,
    varietyText: "Monstera deliciosa",
    varietyState: "selected",
  },
  {
    displayName: "Калатея с чувствителни листа",
    objectKind: "plant",
    spaceIndex: 3,
    catalogItemId: CATALOG_IDS.calatheaSpecies,
    varietyText: "Goeppertia orbifolia",
    varietyState: "selected",
  },
  {
    displayName: "Лимон от семка",
    objectKind: "plant",
    spaceIndex: 3,
    catalogItemId: CATALOG_IDS.lemonSpecies,
    varietyText: "Citrus limon",
    varietyState: "selected",
  },
  {
    displayName: "Лавандула за опрашителите",
    objectKind: "plant",
    spaceIndex: 3,
    catalogItemId: CATALOG_IDS.lavenderSpecies,
    varietyText: "Lavandula angustifolia",
    varietyState: "selected",
  },
  {
    displayName: "Соняшник уздовж огорожі",
    objectKind: "plant",
    spaceIndex: 2,
    catalogItemId: CATALOG_IDS.sunflowerSpecies,
    varietyText: "Helianthus annuus",
    varietyState: "selected",
  },
  {
    displayName: "Полуниця після поділу куща",
    objectKind: "plant",
    spaceIndex: 2,
    catalogItemId: CATALOG_IDS.strawberrySpecies,
    varietyText: "Fragaria x ananassa",
    varietyState: "selected",
  },
  {
    displayName: "М'ята, яку стримує окремий горщик",
    objectKind: "plant",
    spaceIndex: 2,
    varietyState: "unknown",
  },
  {
    displayName: "Орхидея след смяна на субстрата",
    objectKind: "plant",
    spaceIndex: 3,
    varietyText: "Phalaenopsis hybrid",
    varietyState: "free_text",
  },
  {
    displayName: "Маслина на остъкления балкон",
    objectKind: "plant",
    spaceIndex: 3,
    varietyText: "Olea europaea, balcony seedling",
    varietyState: "free_text",
  },
  {
    displayName:
      "Довга назва експериментального томата для перевірки карток і перенесення рядків",
    objectKind: "plant",
    spaceIndex: 2,
    varietyText: "Насіння з домашнього обміну",
    varietyState: "user_added",
  },
  {
    displayName: "Молода яблуня без журналу",
    objectKind: "plant",
    spaceIndex: 2,
    varietyText: "Сорт ще не визначено",
    varietyState: "unknown",
  },
  {
    displayName: "Коза Зірка",
    objectKind: "animal",
    spaceIndex: 4,
    catalogItemId: CATALOG_IDS.localGoatBreed,
    varietyText: "Українська місцева коза",
    varietyState: "selected",
  },
  {
    displayName: "Коза Хмарка після переїзду",
    objectKind: "animal",
    spaceIndex: 4,
    catalogItemId: CATALOG_IDS.bulgarianGoatBreed,
    varietyText: "Българска бяла млечна коза",
    varietyState: "selected",
  },
  {
    displayName: "Курка Ряба з відновленим пір'ям",
    objectKind: "animal",
    spaceIndex: 4,
    catalogItemId: CATALOG_IDS.rhodeIslandBreed,
    varietyText: "Rhode Island Red",
    varietyState: "selected",
  },
  {
    displayName: "Півень Граф",
    objectKind: "animal",
    spaceIndex: 4,
    catalogItemId: CATALOG_IDS.longBantamBreed,
    varietyText:
      "Бельгійська бородата бентамка д'Уккле, порцелянова кольорова лінія",
    varietyState: "selected",
  },
  {
    displayName: "Кішка М'ята біля теплиці",
    objectKind: "animal",
    spaceIndex: 4,
    catalogItemId: CATALOG_IDS.domesticShorthairBreed,
    varietyText: "Domestic Shorthair",
    varietyState: "selected",
  },
  {
    displayName: "Пес Бруно після реабілітації",
    objectKind: "animal",
    spaceIndex: 4,
    catalogItemId: CATALOG_IDS.mixedDogBreed,
    varietyText: "Mixed-breed dog",
    varietyState: "selected",
  },
  {
    displayName: "Кролиця Лада",
    objectKind: "animal",
    spaceIndex: 4,
    catalogItemId: CATALOG_IDS.unavailableRabbitSpecies,
    varietyText: "Oryctolagus cuniculus",
    varietyState: "selected",
  },
  {
    displayName: "Їжак, що приходить до води",
    objectKind: "animal",
    spaceIndex: 4,
    varietyState: "unknown",
  },
  {
    displayName: "Семейство Север",
    objectKind: "bee_colony",
    spaceIndex: 5,
    catalogItemId: CATALOG_IDS.carpathianBeeBreed,
    varietyText: "Карпатська бджола",
    varietyState: "selected",
  },
  {
    displayName: "Семейство Липа",
    objectKind: "bee_colony",
    spaceIndex: 5,
    catalogItemId: CATALOG_IDS.honeyBeeSpecies,
    varietyText: "Apis mellifera",
    varietyState: "selected",
  },
  {
    displayName: "Отводок Июнь",
    objectKind: "bee_colony",
    spaceIndex: 5,
    varietyState: "unknown",
  },
  {
    displayName: "Нуклеус с молодой маткой",
    objectKind: "bee_colony",
    spaceIndex: 5,
    varietyText: "Матка 2026",
    varietyState: "user_added",
  },
];

const objects: readonly VisualFixtureObject[] = objectSeedSpecs.map(
  (spec, offset) => {
    const index = offset + 1;
    const space = spaces[spec.spaceIndex - 1];
    return {
      id: fixtureUuid(3, index),
      ownerUserId: space.ownerUserId,
      spaceId: space.id,
      displayName: spec.displayName,
      objectKind: spec.objectKind,
      catalogItemId: spec.catalogItemId ?? null,
      varietyText: spec.varietyText ?? null,
      varietyState: spec.varietyState,
      locationVisibility: space.locationVisibility,
      coarseRegionCode: space.coarseRegionCode,
      createdAt: timestampForIndex(index),
    };
  },
);

const lineagePendingIdentity: VisualFixtureLineagePendingIdentity = {
  id: fixtureUuid(7, 1),
  createdByUserId: objects[0].ownerUserId,
  displayLabel: "Олена зберегла насіння з першого врожаю",
  createdAt: timestampForIndex(91),
};
const lineageEdge: VisualFixtureLineageEdge = {
  id: fixtureUuid(8, 1),
  ownerUserId: objects[0].ownerUserId,
  subjectObjectId: objects[0].id,
  sourcePendingIdentityId: lineagePendingIdentity.id,
  clientMutationId: "visual-fixture-lineage-claim-1",
  createdAt: timestampForIndex(92),
};
const lineageEvidence: VisualFixtureLineageEvidence = {
  pendingIdentities: [lineagePendingIdentity],
  edges: [lineageEdge],
  claimPendingIdentityId: lineagePendingIdentity.id,
  claimEdgeId: lineageEdge.id,
};

const entryCountsByObject = [
  12,
  5,
  4,
  ...Array.from({ length: 14 }, () => 2),
  0,
  ...Array.from({ length: 7 }, () => 3),
  ...Array.from({ length: 5 }, () => 2),
] as const;

const feedObjectRecencyOrder = [
  0, 18, 26, 6, 22, 27, 1, 23, 28, 7, 24, 29, 2, 19, 25, 3, 20, 4, 21, 5, 8, 9,
  10, 11, 12, 13, 14, 15, 16, 17,
] as const;

const feedRecencyRankByObjectOffset = new Map<number, number>(
  feedObjectRecencyOrder.map((objectOffset, rank) => [objectOffset, rank]),
);

const entries: readonly VisualFixtureEntry[] = buildEntries();

interface MediaSeedSpec {
  fileName: string;
  objectIndex: number;
  publicEntryOffset?: number;
  aspect: VisualFixtureMediaAspect;
  width: number;
  height: number;
  sha256: string;
  altText: string;
}

const mediaSeedSpecs: readonly MediaSeedSpec[] = [
  {
    fileName: "tomato-fruit-square.png",
    objectIndex: 0,
    aspect: "square",
    width: 1254,
    height: 1254,
    sha256: "60866d360740532e5af6d19b8d537351e654fef449d59b67bf161ad8de27515c",
    altText: "Стиглі червоні томати на здоровому кущі в теплиці",
  },
  {
    fileName: "balcony-herbs-square.png",
    objectIndex: 2,
    aspect: "square",
    width: 1254,
    height: 1254,
    sha256: "37f63a9b43142e0d441da66958841f0b756ac0322e04ff80bf61778635ec6864",
    altText: "Гъсти подправки в отделни саксии на градски балкон",
  },
  {
    fileName: "rescue-cat-square.png",
    objectIndex: 22,
    aspect: "square",
    width: 1254,
    height: 1254,
    sha256: "410a03a396c6044a2bb61a8129a26e730d24251bd71431cfae4b30fa2d15e170",
    altText: "Спокійна кішка відпочиває біля дерев'яного ящика в саду",
  },
  {
    fileName: "bee-frame-square.png",
    objectIndex: 26,
    aspect: "square",
    width: 1254,
    height: 1254,
    sha256: "3e5379c0f41e9b11162b7aa40a13abc05c9d5025791560e2e6d504bd63142807",
    altText: "Пчёлы спокойно работают на рамке во время осмотра семьи",
  },
  {
    fileName: "greenhouse-cucumber-4x3.png",
    objectIndex: 0,
    aspect: "landscape_4_3",
    width: 1448,
    height: 1086,
    sha256: "b26bd268b89415e2ed455fc0d063a3eea5757c258770cb1fccb399c96aa71821",
    altText: "Огірки на вертикальній шпалері з ранковим м'яким світлом",
  },
  {
    fileName: "indoor-monstera-4x3.png",
    objectIndex: 7,
    aspect: "landscape_4_3",
    width: 1448,
    height: 1086,
    sha256: "b7d293a789dc0ddc5dd6b1c939b5d1c965bc4fee8583cce01682102e0ddff5d4",
    altText: "Монстера и други стайни растения до светъл прозорец",
  },
  {
    fileName: "goats-yard-4x3.png",
    objectIndex: 18,
    aspect: "landscape_4_3",
    width: 1448,
    height: 1086,
    sha256: "138d4eed8e154c0c5582dad018289419af401b6e7a9213afd3868ca94c3e0cfb",
    altText: "Дві доглянуті кози у чистому затіненому подвір'ї",
  },
  {
    fileName: "apiary-slope-4x3.png",
    objectIndex: 27,
    aspect: "landscape_4_3",
    width: 1448,
    height: 1086,
    sha256: "70f7a728ceeed2fe5f2f3e73a0800cdf8206bbf53529928d081601fb03d47140",
    altText: "Небольшая пасека на зелёном склоне без видимых людей",
  },
  {
    fileName: "pepper-plant-portrait.png",
    objectIndex: 3,
    aspect: "portrait_3_4",
    width: 1086,
    height: 1448,
    sha256: "04c5b85c3384de0f07188208d276b5bae2c2e5b520632528636dedf55a387919",
    altText: "Вертикальний кущ перцю з плодами після прохолодної ночі",
  },
  {
    fileName: "orchid-roots-portrait.png",
    objectIndex: 14,
    aspect: "portrait_3_4",
    width: 1086,
    height: 1448,
    sha256: "e4668366c2e81729d0c4e918f1cdc8da9eb28c8d86c07ead652b05f2725fa82a",
    altText: "Орхидея в прозрачна саксия с видими здрави корени",
  },
  {
    fileName: "rehabilitated-dog-portrait.png",
    objectIndex: 23,
    aspect: "portrait_3_4",
    width: 1086,
    height: 1448,
    sha256: "377f70b85d1c8f49e20ec38789637c30796dc93f1e2e5c18e2ad1e11779b13ff",
    altText: "Спокійний пес стоїть на траві під час відновлення",
  },
  {
    fileName: "young-queen-frame-portrait.png",
    objectIndex: 29,
    aspect: "portrait_3_4",
    width: 1086,
    height: 1448,
    sha256: "086e7eb0382ff88203edd078dbdfab70a23d054516c121c10a781a02e888466f",
    altText: "Вертикальная рамка с молодой маткой и рабочими пчёлами",
  },
  {
    fileName: "greenhouse-wide.png",
    objectIndex: 0,
    aspect: "wide_16_9",
    width: 1672,
    height: 941,
    sha256: "d060d1a32a8168ae8b38367693bbac94efeb1a936bd93afb18fa29ef93ce177b",
    altText: "Широкий огляд теплиці з різними культурами та чистими проходами",
  },
  {
    fileName: "urban-balcony-wide.png",
    objectIndex: 6,
    aspect: "wide_16_9",
    width: 1672,
    height: 941,
    sha256: "75768ed801c2244cb2c5c127bf1296311979013604d01fa9ca206dcd1e89c3d2",
    altText: "Широк градски балкон с растения и място за ежедневна грижа",
  },
  {
    fileName: "animal-yard-wide.png",
    objectIndex: 20,
    aspect: "wide_16_9",
    width: 1672,
    height: 941,
    sha256: "1feb57cb8534583c963799a2ad73149cf9b194517e33b7bc6e4a7360fdc4df1d",
    altText: "Широке подвір'я з козами, курми та окремими зонами догляду",
  },
  {
    fileName: "hive-entrances-wide.png",
    objectIndex: 28,
    aspect: "wide_16_9",
    width: 1672,
    height: 941,
    sha256: "fdd2bc6b99118cee1b3f56ca8cfa955e771018378fc32bb0ad8c24462d60246f",
    altText: "Ряд ульев с активными входами в тёплый ясный день",
  },
];

const media: readonly VisualFixtureMedia[] = mediaSeedSpecs.map(
  (spec, offset) => {
    const index = offset + 1;
    const object = objects[spec.objectIndex];
    const matchingEntries = entries.filter(
      (entry) =>
        entry.objectId === object?.id &&
        entry.visibility === "public" &&
        entry.lifecycleState === "active" &&
        entry.publicGoneAt === null,
    );
    const entry = matchingEntries[spec.publicEntryOffset ?? 0];

    if (!object || !entry) {
      throw new Error(
        `Visual fixture media ${spec.fileName} does not have a matching public entry.`,
      );
    }

    return {
      id: fixtureUuid(5, index),
      ownerUserId: entry.ownerUserId,
      entryId: entry.id,
      fileName: spec.fileName,
      localPath: `test/visual-fixtures/media/${spec.fileName}`,
      quarantineKey: `${VISUAL_FIXTURE_NAMESPACE}/quarantine/${spec.fileName}`,
      derivativeKey: `${VISUAL_FIXTURE_NAMESPACE}/${spec.fileName}`,
      contentType: "image/png",
      aspect: spec.aspect,
      width: spec.width,
      height: spec.height,
      sha256: spec.sha256,
      altText: spec.altText,
      createdAt: timestampForIndex(100 + index),
    };
  },
);

const topics: readonly VisualFixtureTopic[] = [
  {
    id: fixtureUuid(6, 1),
    slug: "seasonal-care",
    label: "Сезонний догляд",
    trustState: "curated",
    createdAt: timestampForIndex(401),
  },
  {
    id: fixtureUuid(6, 2),
    slug: "care-checks",
    label: "Регулярні спостереження",
    trustState: "curated",
    createdAt: timestampForIndex(402),
  },
  {
    id: fixtureUuid(6, 3),
    slug: "quiet-evidence",
    label: "Відновлення після стресу",
    trustState: "curated",
    createdAt: timestampForIndex(403),
  },
  {
    id: fixtureUuid(6, 4),
    slug: "watering-and-moisture",
    label: "Полив і вологість",
    trustState: "curated",
    createdAt: timestampForIndex(404),
  },
  {
    id: fixtureUuid(6, 5),
    slug: "stress-and-recovery",
    label: "Проблеми та відновлення",
    trustState: "curated",
    createdAt: timestampForIndex(405),
  },
  {
    id: fixtureUuid(6, 6),
    slug: "season-preparation",
    label: "Підготовка до сезону",
    trustState: "curated",
    createdAt: timestampForIndex(406),
  },
];

const publicFeedEligibleEntries = entries.filter(
  (entry) =>
    entry.visibility === "public" &&
    entry.lifecycleState === "active" &&
    entry.publicGoneAt === null &&
    entry.publishedAt !== null,
);
const publicFeedEntriesByKind = Object.groupBy(
  publicFeedEligibleEntries,
  (entry) =>
    objects.find((object) => object.id === entry.objectId)?.objectKind ??
    "plant",
);
const denseTopicEntries = [
  publicFeedEntriesByKind.plant?.[0],
  publicFeedEntriesByKind.animal?.[0],
  publicFeedEntriesByKind.bee_colony?.[0],
  publicFeedEntriesByKind.plant?.[1],
  publicFeedEntriesByKind.animal?.[1],
  publicFeedEntriesByKind.bee_colony?.[1],
  publicFeedEntriesByKind.plant?.[2],
  publicFeedEntriesByKind.animal?.[2],
  publicFeedEntriesByKind.bee_colony?.[2],
  publicFeedEntriesByKind.plant?.[3],
  publicFeedEntriesByKind.animal?.[3],
].filter((entry): entry is VisualFixtureEntry => Boolean(entry));
const typicalTopicEntries = [
  publicFeedEntriesByKind.plant?.[0],
  publicFeedEntriesByKind.animal?.[0],
  publicFeedEntriesByKind.bee_colony?.[0],
  publicFeedEntriesByKind.plant?.[1],
].filter((entry): entry is VisualFixtureEntry => Boolean(entry));
const sortedPublicDirectoryEntries = [...publicFeedEligibleEntries].sort(
  compareFeedEntries,
);
const directoryMinusOneEntries = sortedPublicDirectoryEntries.slice(0, 7);
const directoryExactPageEntries = sortedPublicDirectoryEntries.slice(0, 8);
const directoryPlusOneEntries = sortedPublicDirectoryEntries.slice(0, 9);
const topicSignals: readonly VisualFixtureTopicSignal[] = [
  ...typicalTopicEntries.map((entry, index) =>
    createTopicSignal(entry, topics[0], 410 + index),
  ),
  ...denseTopicEntries.map((entry, index) =>
    createTopicSignal(entry, topics[1], 420 + index),
  ),
  ...directoryMinusOneEntries.map((entry, index) =>
    createTopicSignal(entry, topics[3], 440 + index),
  ),
  ...directoryExactPageEntries.map((entry, index) =>
    createTopicSignal(entry, topics[4], 450 + index),
  ),
  ...directoryPlusOneEntries.map((entry, index) =>
    createTopicSignal(entry, topics[5], 460 + index),
  ),
];
const sortedDenseTopicEntries = [...denseTopicEntries].sort(compareFeedEntries);
const pageTwoAnchor = sortedDenseTopicEntries[7];
const exhaustedAnchor = sortedDenseTopicEntries.at(-2);

const mediaCountByEntry = new Map<string, number>();
for (const item of media) {
  mediaCountByEntry.set(
    item.entryId,
    (mediaCountByEntry.get(item.entryId) ?? 0) + 1,
  );
}
const mediaEntryIds = new Set(mediaCountByEntry.keys());
const galleryEntries = entries.filter(
  (entry) => (mediaCountByEntry.get(entry.id) ?? 0) === 3,
);

if (!pageTwoAnchor || !exhaustedAnchor || galleryEntries.length !== 1) {
  throw new Error("Visual fixture feed evidence is incomplete.");
}

const feedEvidence: VisualFixtureFeedEvidence = {
  pageSize: 8,
  typicalTopicSlug: topics[0].slug,
  denseTopicSlug: topics[1].slug,
  emptyTopicSlug: topics[2].slug,
  galleryEntryId: galleryEntries[0].id,
  pageTwoCursor: {
    id: pageTwoAnchor.id,
    publishedAt: pageTwoAnchor.publishedAt!,
  },
  exhaustedCursor: {
    id: exhaustedAnchor.id,
    publishedAt: exhaustedAnchor.publishedAt!,
  },
};

const journalDirectoryEvidence = buildJournalDirectoryEvidence();

const emptySpaces = spaces.filter(
  (space) => !objects.some((object) => object.spaceId === space.id),
);
const emptyObjects = objects.filter(
  (object) => !entries.some((entry) => entry.objectId === object.id),
);
const todayEntries = entries.filter(
  (entry) => entry.entryDate === "2026-07-10",
);
const ownerOnlyEntries = entries.filter(
  (entry) => entry.visibility === "private",
);
const archivedEntries = entries.filter(
  (entry) => entry.lifecycleState === "archived",
);
const maximumCopyEntries = entries.filter(
  (entry) => entry.title.length === 140 || entry.body.length === 2000,
);
const noMediaEntries = entries.filter(
  (entry) =>
    entry.visibility === "public" &&
    entry.lifecycleState === "active" &&
    entry.publicGoneAt === null &&
    !mediaEntryIds.has(entry.id),
);
const oneMediaEntries = entries.filter(
  (entry) => (mediaCountByEntry.get(entry.id) ?? 0) === 1,
);

const stateCoverage: readonly VisualFixtureStateCoverage[] = [
  coverageState(
    "empty-space",
    "Empty space",
    "No living objects; owner workspace empty-state boundary.",
    emptySpaces.length,
    "owner",
    null,
  ),
  coverageState(
    "empty-object",
    "Empty object",
    "Living object without public journal history.",
    emptyObjects.length,
    "public",
    `/lineage/objects/${emptyObjects[0].id}`,
  ),
  coverageState(
    "today-journal",
    "Today's journal",
    "Deterministic current-day grouping anchor for this fixture version.",
    todayEntries.length,
    "public",
    `/journal/${todayEntries[0].publicSlug}`,
  ),
  coverageState(
    "owner-only-journal",
    "Owner-only journals",
    "Private records exist but have no public route or serialized preview.",
    ownerOnlyEntries.length,
    "owner",
    null,
  ),
  coverageState(
    "archived-journal",
    "Archived journals",
    "Archived records exercise owner history and public suppression.",
    archivedEntries.length,
    "owner",
    null,
  ),
  coverageState(
    "maximum-copy",
    "Maximum-length copy",
    "Exact 140-character title and 2,000-character body boundary.",
    maximumCopyEntries.length,
    "public",
    `/journal/${maximumCopyEntries[0].publicSlug}`,
  ),
  coverageState(
    "no-media-journal",
    "Public journal without media",
    "Real published route with text only.",
    noMediaEntries.length,
    "public",
    `/journal/${noMediaEntries[0].publicSlug}`,
  ),
  coverageState(
    "one-media-journal",
    "Public journal with one image",
    "Real published route backed by one stripped derivative.",
    oneMediaEntries.length,
    "public",
    `/journal/${oneMediaEntries[0].publicSlug}`,
  ),
  coverageState(
    "media-gallery",
    "Media gallery",
    "All deterministic aspect ratios in one inspectable collection.",
    media.length,
    "public",
    "/__visual-fixtures#media-gallery",
  ),
  coverageState(
    "feed-empty",
    "Empty public feed",
    "Curated trusted topic with zero eligible public journal entries.",
    1,
    "public",
    `/?topic=${feedEvidence.emptyTopicSlug}`,
  ),
  coverageState(
    "feed-typical",
    "Typical mixed public feed",
    "Four repository-backed plant, animal, and bee-colony updates.",
    typicalTopicEntries.length,
    "public",
    `/?topic=${feedEvidence.typicalTopicSlug}`,
  ),
  coverageState(
    "feed-dense",
    "Dense mixed public feed",
    "Page-size-plus-three eligible updates with real continuation.",
    denseTopicEntries.length,
    "public",
    `/?topic=${feedEvidence.denseTopicSlug}`,
  ),
  coverageState(
    "feed-loading",
    "Public feed loading",
    "Stable production loading composition under the fixture-only gate.",
    1,
    "public",
    "/?__visualFeed=loading",
  ),
  coverageState(
    "feed-error",
    "Recoverable public feed error",
    "Read-open route error with retry and knowledge continuation.",
    1,
    "public",
    "/?__visualFeed=error",
  ),
  coverageState(
    "feed-pagination",
    "Public feed second page",
    "Cursor-backed continuation using the same dense trusted topic.",
    denseTopicEntries.length - feedEvidence.pageSize,
    "public",
    "/?__visualFeed=page-2",
  ),
  coverageState(
    "feed-exhausted",
    "Exhausted public feed",
    "Final cursor window with no false continuation action.",
    1,
    "public",
    "/?__visualFeed=exhausted",
  ),
  coverageState(
    "feed-context-empty",
    "Empty feed context rail",
    "The feed remains useful when no trusted topic module is available.",
    1,
    "public",
    "/?__visualFeed=context-empty",
  ),
];

const activeEntry = entries.find(
  (entry) => entry.visibility === "public" && entry.lifecycleState === "active",
)!;
const goneEntry = entries.find((entry) => entry.publicGoneAt !== null)!;
const activeJournalPath = `/journal/${activeEntry.publicSlug}`;
const goneJournalPath = `/journal/${goneEntry.publicSlug}`;
const denseObjectPath = `/lineage/objects/${objects[0].id}`;

const intentEvidence: VisualFixtureIntentEvidence = {
  scenarios: [
    intentScenario(
      1,
      "comment",
      "Comment · guest start",
      "guest",
      activeJournalPath,
      {
        kind: "journal",
        ref: activeEntry.publicSlug!,
      },
    ),
    intentScenario(
      2,
      "bookmark",
      "Bookmark · guest start",
      "guest",
      activeJournalPath,
      { kind: "journal", ref: activeEntry.publicSlug! },
    ),
    intentScenario(
      3,
      "follow",
      "Follow · guest start",
      "guest",
      denseObjectPath,
      {
        kind: "object",
        ref: objects[0].id,
      },
    ),
    intentScenario(
      4,
      "claim",
      "Claim · guest start",
      "guest",
      "/garden/lineage/invitations/claim",
    ),
    intentScenario(
      5,
      "create_object",
      "Add object · guest start",
      "guest",
      "/garden",
    ),
    intentScenario(
      6,
      "create_entry",
      "Add journal entry · guest start",
      "guest",
      "/garden",
    ),
    {
      ...intentScenario(
        7,
        "save",
        "Save · retained first-entry draft",
        "draft_retained",
        "/garden?tab=drafts",
      ),
      draftKind: "first_entry",
    },
    intentScenario(
      8,
      "publish",
      "Publish · permission recheck",
      "insufficient_permission",
      `/garden/objects/${objects[0].id}`,
      { kind: "journal", ref: activeEntry.publicSlug! },
      "valid",
      404,
    ),
    intentScenario(
      9,
      "comment",
      "Comment · already authenticated",
      "already_authenticated",
      activeJournalPath,
      { kind: "journal", ref: activeEntry.publicSlug! },
    ),
    intentScenario(
      10,
      "comment",
      "Comment · cancel",
      "cancel",
      activeJournalPath,
      {
        kind: "journal",
        ref: activeEntry.publicSlug!,
      },
    ),
    intentScenario(
      11,
      "comment",
      "Comment · expired intent",
      "expired",
      activeJournalPath,
      { kind: "journal", ref: activeEntry.publicSlug! },
      "expired",
    ),
    intentScenario(
      12,
      "bookmark",
      "Bookmark · invalid intent",
      "invalid",
      activeJournalPath,
      { kind: "journal", ref: activeEntry.publicSlug! },
      "invalid",
    ),
    intentScenario(
      13,
      "comment",
      "Comment · deleted journal",
      "deleted_410",
      goneJournalPath,
      { kind: "journal", ref: goneEntry.publicSlug! },
      "valid",
      410,
    ),
    intentScenario(
      14,
      "comment",
      "Comment · now unavailable",
      "now_private",
      "/journal/visual-fixture-private-transition",
      { kind: "journal", ref: "visual-fixture-private-transition" },
      "valid",
      404,
    ),
    intentScenario(
      15,
      "follow",
      "Follow · insufficient permission",
      "insufficient_permission",
      denseObjectPath,
      { kind: "object", ref: objects[0].id },
    ),
    intentScenario(
      16,
      "bookmark",
      "Bookmark · preserved feed context",
      "guest",
      `/?topic=${feedEvidence.denseTopicSlug}&cursor=fixture-page-2&tab=journal&sort=newest`,
      { kind: "collection", ref: feedEvidence.denseTopicSlug },
    ),
    {
      ...intentScenario(
        17,
        "create_entry",
        "Add journal entry · retained draft",
        "draft_retained",
        "/garden?tab=drafts&entry=fixture-draft-17",
      ),
      draftKind: "first_entry",
    },
    intentScenario(
      18,
      "bookmark",
      "Bookmark · profile target",
      "guest",
      `/@${actors[0].handle}`,
      { kind: "profile", ref: actors[0].handle },
    ),
    {
      ...intentScenario(
        19,
        "save",
        "Save · follow-up draft permission changed",
        "draft_retained",
        `/garden/objects/${objects[0].id}`,
        { kind: "object", ref: objects[0].id },
        "valid",
        404,
      ),
      draftKind: "follow_up_entry",
    },
  ],
};

const scenarios: readonly VisualFixtureScenario[] = [
  scenario(
    "index",
    "fixture-index",
    "Fixture overview",
    "/__visual-fixtures",
    200,
  ),
  scenario(
    "feed-empty",
    "public-feed-empty",
    "Empty public feed",
    `/?topic=${feedEvidence.emptyTopicSlug}`,
    200,
  ),
  scenario(
    "feed-typical",
    "public-feed-typical",
    "Typical mixed public feed",
    `/?topic=${feedEvidence.typicalTopicSlug}`,
    200,
  ),
  scenario(
    "feed-dense",
    "public-feed-dense",
    "Dense mixed public feed",
    `/?topic=${feedEvidence.denseTopicSlug}`,
    200,
  ),
  scenario(
    "feed-loading",
    "public-feed-loading",
    "Public feed loading",
    "/?__visualFeed=loading",
    200,
  ),
  scenario(
    "feed-error",
    "public-feed-error",
    "Recoverable public feed error",
    "/?__visualFeed=error",
    200,
  ),
  scenario(
    "feed-page-2",
    "public-feed-pagination",
    "Public feed second page",
    "/?__visualFeed=page-2",
    200,
  ),
  scenario(
    "feed-exhausted",
    "public-feed-exhausted",
    "Exhausted public feed",
    "/?__visualFeed=exhausted",
    200,
  ),
  scenario(
    "feed-context-empty",
    "public-feed-context-empty",
    "Empty public feed context rail",
    "/?__visualFeed=context-empty",
    200,
  ),
  scenario(
    "catalog-empty",
    "public-catalog-empty",
    "Empty bee taxonomy category",
    "/objects?kind=bee_colony&identity=unavailable",
    200,
  ),
  scenario(
    "catalog-zero-results",
    "public-catalog-zero-results",
    "Catalog zero-result recovery",
    "/objects?q=visual-fixture-no-match",
    200,
  ),
  scenario(
    "catalog-sparse",
    "public-catalog-sparse",
    "Sparse bee breed catalog",
    "/ru/objects?kind=bee_colony&identity=breed",
    200,
  ),
  scenario(
    "catalog-page-size-minus-one",
    "public-catalog-page-size-minus-one",
    "Five provisional plant identities",
    "/objects?kind=plant&identity=provisional",
    200,
  ),
  scenario(
    "catalog-page-size",
    "public-catalog-page-size",
    "Six animal breed identities",
    "/objects?kind=animal&identity=breed",
    200,
  ),
  scenario(
    "catalog-page-size-plus-one",
    "public-catalog-page-size-plus-one",
    "Seven plant species with continuation",
    "/objects?kind=plant&identity=species",
    200,
  ),
  scenario(
    "catalog-pagination",
    "public-catalog-pagination",
    "Plant species second page",
    "/objects?kind=plant&identity=species&page=2",
    200,
  ),
  scenario(
    "catalog-combined-filters",
    "public-catalog-combined-filters",
    "Localized bee species search",
    "/bg/objects?kind=bee_colony&identity=species&q=Apis",
    200,
  ),
  scenario(
    "catalog-search-alias",
    "public-catalog-search-alias",
    "Catalog alias search",
    "/bg/objects?kind=plant&q=%D0%BB%D0%B0%D0%B2%D0%B0%D0%BD%D0%B4%D1%83%D0%BB%D0%B0",
    200,
  ),
  scenario(
    "catalog-unavailable",
    "public-catalog-unavailable",
    "Unavailable taxonomy remains explicit",
    "/objects?kind=animal&identity=unavailable",
    200,
  ),
  scenario(
    "catalog-loading",
    "public-catalog-loading",
    "Public catalog loading",
    "/bg/objects?__visualObjects=loading",
    200,
  ),
  scenario(
    "catalog-error",
    "public-catalog-error",
    "Recoverable public catalog error",
    "/ru/objects?__visualObjects=error",
    200,
  ),
  scenario(
    "catalog-variety",
    "public-catalog-variety",
    "Plant variety evidence",
    "/variety/visual-pomidor-cheri",
    200,
  ),
  scenario(
    "catalog-species",
    "public-catalog-species",
    "Plant species evidence",
    "/species/visual-rosmarinus-officinalis",
    200,
  ),
  scenario(
    "catalog-breed",
    "public-catalog-breed",
    "Bee breed evidence",
    "/breed/visual-karpatska-bdzhola",
    200,
  ),
  scenario(
    "journal-directory-default",
    "public-journal-directory-default",
    "Journal directory default browse",
    journalDirectoryEvidencePath("default"),
    200,
  ),
  scenario(
    "journal-directory-minus-one",
    "public-journal-directory-page-size-minus-one",
    "Journal directory with seven results",
    journalDirectoryEvidencePath("page-size-minus-one"),
    200,
  ),
  scenario(
    "journal-directory-exact-page",
    "public-journal-directory-page-size",
    "Journal directory with one exact page",
    journalDirectoryEvidencePath("page-size"),
    200,
  ),
  scenario(
    "journal-directory-plus-one",
    "public-journal-directory-page-size-plus-one",
    "Journal directory with real continuation",
    journalDirectoryEvidencePath("page-size-plus-one"),
    200,
  ),
  scenario(
    "journal-directory-page-two",
    "public-journal-directory-pagination",
    "Journal directory second page",
    journalDirectoryEvidencePath("page-two"),
    200,
  ),
  scenario(
    "journal-directory-combined",
    "public-journal-directory-combined-filters",
    "Bee journals by season and safe region",
    journalDirectoryEvidencePath("combined-safe-filters"),
    200,
  ),
  scenario(
    "journal-directory-zero",
    "public-journal-directory-zero-results",
    "Journal directory zero-result recovery",
    journalDirectoryEvidencePath("zero-results"),
    200,
  ),
  scenario(
    "journal-directory-corrected",
    "public-journal-directory-corrected-query",
    "Journal directory corrected query",
    journalDirectoryEvidencePath("corrected-query"),
    200,
  ),
  scenario(
    "journal-directory-loading",
    "public-journal-directory-loading",
    "Journal directory loading",
    "/bg/journals?__visualJournals=loading",
    200,
  ),
  scenario(
    "journal-directory-error",
    "public-journal-directory-error",
    "Recoverable journal directory error",
    "/ru/journals?__visualJournals=error",
    200,
  ),
  scenario(
    "journal-directory-exhausted",
    "public-journal-directory-exhausted",
    "Journal directory final page",
    journalDirectoryEvidencePath("exhausted"),
    200,
  ),
  scenario(
    "journal-active",
    "public-journal-active",
    "Published journal with media",
    `/journal/${activeEntry.publicSlug}`,
    200,
  ),
  scenario(
    "journal-gone",
    "public-journal-gone",
    "Deleted public journal",
    `/journal/${goneEntry.publicSlug}`,
    410,
  ),
  scenario(
    "journal-missing",
    "public-journal-missing",
    "Unknown journal",
    "/journal/visual-fixtures-missing-entry",
    404,
  ),
  scenario(
    "object-empty",
    "public-object-empty",
    "Object without public history",
    `/lineage/objects/${objects[17].id}`,
    200,
    "not_found",
  ),
  scenario(
    "object-typical",
    "public-object-typical",
    "Typical object passport",
    `/lineage/objects/${objects[1].id}`,
    200,
  ),
  scenario(
    "object-dense",
    "public-object-dense",
    "Dense object passport",
    `/lineage/objects/${objects[0].id}`,
    200,
  ),
  scenario(
    "profile",
    "public-profile",
    "Public fixture profile",
    `/@${actors[0].handle}`,
    200,
  ),
  scenario(
    "media",
    "media-gallery",
    "Fixture media aspect gallery",
    "/__visual-fixtures#media-gallery",
    200,
  ),
];

export const VISUAL_FIXTURE_MANIFEST: VisualFixtureManifest = {
  version: VISUAL_FIXTURE_MANIFEST_VERSION,
  namespace: VISUAL_FIXTURE_NAMESPACE,
  actors,
  spaces,
  catalogItems,
  catalogNames,
  objects,
  entries,
  media,
  topics,
  topicSignals,
  feedEvidence,
  journalDirectoryEvidence,
  lineageEvidence,
  intentEvidence,
  stateCoverage,
  scenarios,
};

export const VISUAL_FIXTURE_MANIFEST_HASH = calculateVisualFixtureManifestHash(
  VISUAL_FIXTURE_MANIFEST,
);

export function calculateVisualFixtureManifestHash(
  manifest: VisualFixtureManifest,
): string {
  return createHash("sha256").update(canonicalJson(manifest)).digest("hex");
}

export function validateVisualFixtureManifest(
  manifest: VisualFixtureManifest,
): string[] {
  const errors: string[] = [];
  checkCount(errors, "actors", manifest.actors.length, 4);
  checkCount(errors, "spaces", manifest.spaces.length, 5);
  checkCount(errors, "objects", manifest.objects.length, 30);
  checkCount(errors, "catalog items", manifest.catalogItems.length, 19);
  checkCount(errors, "catalog names", manifest.catalogNames.length, 29);
  checkCount(errors, "entries", manifest.entries.length, 80);
  checkCount(errors, "media", manifest.media.length, 16);
  checkCount(errors, "topics", manifest.topics.length, 6);
  checkCount(errors, "topic signals", manifest.topicSignals.length, 39);

  const actorIds = new Set(manifest.actors.map((actor) => actor.id));
  const spaceIds = new Set(manifest.spaces.map((space) => space.id));
  const objectIds = new Set(manifest.objects.map((object) => object.id));
  const catalogItemIds = new Set(manifest.catalogItems.map((item) => item.id));
  const entryIds = new Set(manifest.entries.map((entry) => entry.id));
  const topicIds = new Set(manifest.topics.map((topic) => topic.id));
  const pendingIdentityIds = new Set(
    manifest.lineageEvidence.pendingIdentities.map((identity) => identity.id),
  );
  checkUnique(
    errors,
    "actor ids",
    manifest.actors.map((actor) => actor.id),
  );
  checkUnique(
    errors,
    "actor handles",
    manifest.actors.map((actor) => actor.handle),
  );
  checkUnique(
    errors,
    "space ids",
    manifest.spaces.map((space) => space.id),
  );
  checkUnique(
    errors,
    "object ids",
    manifest.objects.map((object) => object.id),
  );
  checkUnique(
    errors,
    "catalog item ids",
    manifest.catalogItems.map((item) => item.id),
  );
  checkUnique(
    errors,
    "catalog public slugs",
    manifest.catalogItems.map((item) => item.publicSlug),
  );
  checkUnique(
    errors,
    "catalog name ids",
    manifest.catalogNames.map((name) => name.id),
  );
  checkUnique(
    errors,
    "entry ids",
    manifest.entries.map((entry) => entry.id),
  );
  checkUnique(
    errors,
    "media ids",
    manifest.media.map((item) => item.id),
  );
  checkUnique(
    errors,
    "media keys",
    manifest.media.map((item) => item.derivativeKey),
  );
  checkUnique(
    errors,
    "topic ids",
    manifest.topics.map((topic) => topic.id),
  );
  checkUnique(
    errors,
    "topic slugs",
    manifest.topics.map((topic) => topic.slug),
  );
  checkUnique(
    errors,
    "topic memberships",
    manifest.topicSignals.map(
      (signal) => `${signal.journalEntryId}:${signal.topicId}`,
    ),
  );
  checkUnique(
    errors,
    "public slugs",
    manifest.entries.flatMap((entry) =>
      entry.publicSlug ? [entry.publicSlug] : [],
    ),
  );
  checkUnique(
    errors,
    "state coverage ids",
    manifest.stateCoverage.map((state) => state.id),
  );
  checkUnique(
    errors,
    "state coverage kinds",
    manifest.stateCoverage.map((state) => state.kind),
  );
  checkUnique(
    errors,
    "scenario ids",
    manifest.scenarios.map((scenario) => scenario.id),
  );
  checkUnique(
    errors,
    "scenario kinds",
    manifest.scenarios.map((scenario) => scenario.kind),
  );
  checkUnique(
    errors,
    "journal directory evidence ids",
    manifest.journalDirectoryEvidence.queries.map((query) => query.id),
  );
  checkUnique(
    errors,
    "intent scenario ids",
    manifest.intentEvidence.scenarios.map((scenario) => scenario.id),
  );
  checkUnique(
    errors,
    "lineage pending identity ids",
    manifest.lineageEvidence.pendingIdentities.map((identity) => identity.id),
  );
  checkUnique(
    errors,
    "lineage edge ids",
    manifest.lineageEvidence.edges.map((edge) => edge.id),
  );

  for (const actor of manifest.actors) {
    if (!actor.email.endsWith("@visual-fixtures.invalid")) {
      errors.push(`Actor ${actor.id} does not use the reserved email domain.`);
    }
  }
  for (const space of manifest.spaces) {
    if (!actorIds.has(space.ownerUserId)) {
      errors.push(`Space ${space.id} references an unknown actor.`);
    }
  }
  for (const object of manifest.objects) {
    if (!actorIds.has(object.ownerUserId) || !spaceIds.has(object.spaceId)) {
      errors.push(`Object ${object.id} has an invalid owner or space.`);
    }
    if (
      object.catalogItemId !== null &&
      !catalogItemIds.has(object.catalogItemId)
    ) {
      errors.push(`Object ${object.id} references a non-fixture catalog row.`);
    }
  }
  for (const item of manifest.catalogItems) {
    if (
      item.source !== "visual_fixture" ||
      !item.sourceId.startsWith("ove175-visual-")
    ) {
      errors.push(`Catalog item ${item.id} has unsafe fixture provenance.`);
    }
    if (!item.publicSlug.startsWith("visual-")) {
      errors.push(`Catalog item ${item.id} has a non-fixture public slug.`);
    }
  }
  for (const name of manifest.catalogNames) {
    if (!catalogItemIds.has(name.catalogItemId)) {
      errors.push(`Catalog name ${name.id} references an unknown item.`);
    }
  }
  for (const identity of manifest.lineageEvidence.pendingIdentities) {
    if (!actorIds.has(identity.createdByUserId)) {
      errors.push(`Lineage identity ${identity.id} has an invalid creator.`);
    }
  }
  for (const edge of manifest.lineageEvidence.edges) {
    if (
      !actorIds.has(edge.ownerUserId) ||
      !objectIds.has(edge.subjectObjectId) ||
      !pendingIdentityIds.has(edge.sourcePendingIdentityId)
    ) {
      errors.push(`Lineage edge ${edge.id} has an invalid fixture reference.`);
    }
  }
  if (
    !pendingIdentityIds.has(manifest.lineageEvidence.claimPendingIdentityId) ||
    !manifest.lineageEvidence.edges.some(
      (edge) => edge.id === manifest.lineageEvidence.claimEdgeId,
    )
  ) {
    errors.push("Lineage claim evidence does not reference fixture rows.");
  }
  for (const entry of manifest.entries) {
    if (
      !actorIds.has(entry.ownerUserId) ||
      !spaceIds.has(entry.spaceId) ||
      !objectIds.has(entry.objectId)
    ) {
      errors.push(`Entry ${entry.id} has an invalid owner, space, or object.`);
    }
    if (entry.title.length < 1 || entry.title.length > 140) {
      errors.push(`Entry ${entry.id} has an invalid title length.`);
    }
    if (entry.body.length < 1 || entry.body.length > 2000) {
      errors.push(`Entry ${entry.id} has an invalid body length.`);
    }
  }
  for (const item of manifest.media) {
    if (!entryIds.has(item.entryId)) {
      errors.push(`Media ${item.id} references an unknown entry.`);
    }
    if (!item.derivativeKey.startsWith(`${manifest.namespace}/`)) {
      errors.push(`Media ${item.id} is outside the fixture namespace.`);
    }
  }
  for (const signal of manifest.topicSignals) {
    const entry = manifest.entries.find(
      (candidate) => candidate.id === signal.journalEntryId,
    );
    if (!entry || !topicIds.has(signal.topicId)) {
      errors.push("Topic signal references an unknown entry or topic.");
      continue;
    }
    if (
      entry.visibility !== "public" ||
      entry.lifecycleState !== "active" ||
      entry.publicGoneAt !== null
    ) {
      errors.push(`Topic signal exposes ineligible entry ${entry.id}.`);
    }
  }
  const publicEntryById = new Map(
    manifest.entries
      .filter(
        (entry) =>
          entry.visibility === "public" &&
          entry.lifecycleState === "active" &&
          entry.publicGoneAt === null &&
          entry.publishedAt !== null &&
          entry.publicSlug !== null,
      )
      .map((entry) => [entry.id, entry]),
  );
  if (manifest.journalDirectoryEvidence.pageSize !== 8) {
    errors.push(
      "Journal directory evidence must use the production page size.",
    );
  }
  if (manifest.journalDirectoryEvidence.hiddenRegionEntryCount < 1) {
    errors.push("Journal directory evidence has no hidden-region record.");
  }
  for (const query of manifest.journalDirectoryEvidence.queries) {
    if (!/^\/(?:bg\/|ru\/)?journals(?:\?|$)/.test(query.path)) {
      errors.push(
        `Journal directory evidence ${query.id} has an invalid path.`,
      );
    }
    if (
      query.expectedOrderedEntryIds.length !==
      query.expectedOrderedPublicSlugs.length
    ) {
      errors.push(
        `Journal directory evidence ${query.id} has mismatched order arrays.`,
      );
      continue;
    }
    query.expectedOrderedEntryIds.forEach((entryId, index) => {
      const entry = publicEntryById.get(entryId);
      if (
        !entry ||
        entry.publicSlug !== query.expectedOrderedPublicSlugs[index]
      ) {
        errors.push(
          `Journal directory evidence ${query.id} references an ineligible or mismatched entry.`,
        );
      }
    });
    if (query.expectedOrderedEntryIds.length > 8) {
      errors.push(`Journal directory evidence ${query.id} exceeds one page.`);
    }
  }
  const manifestMediaCounts = Object.groupBy(
    manifest.media,
    (item) => item.entryId,
  );
  if (
    Object.values(manifestMediaCounts).filter(
      (items) => (items?.length ?? 0) === 3,
    ).length !== 1
  ) {
    errors.push("Manifest must contain exactly one three-image feed gallery.");
  }
  for (const anchor of [
    manifest.feedEvidence.pageTwoCursor,
    manifest.feedEvidence.exhaustedCursor,
  ]) {
    if (!entryIds.has(anchor.id) || !anchor.publishedAt.endsWith("Z")) {
      errors.push("Feed cursor anchor is not a deterministic public entry.");
    }
  }
  for (const state of manifest.stateCoverage) {
    if (state.count < 1) {
      errors.push(`State coverage ${state.id} has no matching fixtures.`);
    }
    if (state.path !== null && !state.path.startsWith("/")) {
      errors.push(`State coverage ${state.id} has an invalid route path.`);
    }
    if (state.access === "owner" && state.path !== null) {
      errors.push(`Owner-only state coverage ${state.id} exposes a route.`);
    }
  }
  for (const intent of manifest.intentEvidence.scenarios) {
    if (intent.startPath !== `/__visual-fixtures/intent/${intent.id}`) {
      errors.push(
        `Intent scenario ${intent.id} exposes an invalid start path.`,
      );
    }
    try {
      const draft = normalizeAuthIntentDraft({
        action: intent.action,
        returnTo: intent.returnTo,
        ...(intent.target ? { target: intent.target } : {}),
      });
      if (intent.resumePath !== buildAuthIntentResumeHref(draft)) {
        errors.push(`Intent scenario ${intent.id} has an invalid resume path.`);
      }
    } catch {
      errors.push(`Intent scenario ${intent.id} has an invalid auth contract.`);
    }
    if (intent.state === "draft_retained" && !intent.draftKind) {
      errors.push(`Intent scenario ${intent.id} does not seed a real draft.`);
    }
    if (intent.state !== "draft_retained" && intent.draftKind) {
      errors.push(`Intent scenario ${intent.id} has an unexpected draft seed.`);
    }
  }

  const serialized = JSON.stringify(manifest);
  if (
    /password|access[_-]?token|refresh[_-]?token|session[_-]?token|latitude|longitude|coordinates|gps|https:\/\/over\.garden|lorem ipsum/i.test(
      serialized,
    )
  ) {
    errors.push(
      "Manifest contains forbidden production, privacy, or filler data.",
    );
  }

  return errors;
}

function buildEntries(): readonly VisualFixtureEntry[] {
  const result: VisualFixtureEntry[] = [];
  let globalIndex = 0;

  objects.forEach((object, objectOffset) => {
    const actor = actors.find(
      (candidate) => candidate.id === object.ownerUserId,
    )!;
    const count = entryCountsByObject[objectOffset];

    for (let ordinal = 1; ordinal <= count; ordinal += 1) {
      globalIndex += 1;
      const gone = globalIndex === 79;
      const archived = gone || globalIndex === 71 || globalIndex === 75;
      const isDenseObject = objectOffset === 0;
      const isPrivate =
        !gone && (isDenseObject ? ordinal > 10 : globalIndex % 9 === 0);
      const visibility: VisualFixtureVisibility = isPrivate
        ? "private"
        : "public";
      const feedRecencyRank =
        feedRecencyRankByObjectOffset.get(objectOffset) ?? objectOffset;
      const entryDate = dateDaysBefore(
        (ordinal - 1) * objects.length + feedRecencyRank,
      );
      const publicSlug =
        visibility === "public"
          ? `visual-fixture-${slugPart(object.displayName)}-${String(globalIndex).padStart(3, "0")}`
          : null;
      const title = entryTitle(actor.locale, object, ordinal, globalIndex);
      const body = entryBody(actor.locale, object, ordinal, globalIndex);
      const publishedAt =
        visibility === "public" ? `${entryDate}T12:00:00.000Z` : null;

      result.push({
        id: fixtureUuid(4, globalIndex),
        ownerUserId: object.ownerUserId,
        spaceId: object.spaceId,
        objectId: object.id,
        locale: actor.locale,
        title,
        body,
        entryDate,
        visibility,
        lifecycleState: archived ? "archived" : "active",
        publicSlug,
        publicNoindex: true,
        publishedAt,
        archivedAt: archived ? "2026-07-08T16:00:00.000Z" : null,
        publicGoneAt: gone ? "2026-07-09T16:00:00.000Z" : null,
        firstPublicationDisclosureVersion:
          visibility === "public" ? "first-publication-v4" : null,
        firstPublicationDisclosedAt: publishedAt,
        clientMutationId: `${VISUAL_FIXTURE_NAMESPACE}/entry-${String(globalIndex).padStart(3, "0")}`,
        createdAt: timestampForIndex(200 + globalIndex),
      });
    }
  });

  return result;
}

function entryTitle(
  locale: VisualFixtureLocale,
  object: VisualFixtureObject,
  ordinal: number,
  globalIndex: number,
) {
  if (globalIndex === 6) {
    return "Підсумок повного сезону для Черрі біля південної стінки: полив, підв'язування, зав'язь, спека, відновлення та план наступного циклу у серпні";
  }

  const titleByLocale = {
    uk: [
      "Ранкове спостереження",
      "Що змінилося за тиждень",
      "Перевірка після догляду",
      "Нотатка перед наступним кроком",
    ],
    bg: [
      "Сутрешно наблюдение",
      "Промяната през тази седмица",
      "Проверка след грижата",
      "Бележка преди следващата стъпка",
    ],
    ru: [
      "Утреннее наблюдение",
      "Что изменилось за неделю",
      "Проверка после ухода",
      "Запись перед следующим шагом",
    ],
  } as const;
  const phrase = titleByLocale[locale][(ordinal - 1) % 4];
  return `${phrase}: ${object.displayName} · ${String(globalIndex).padStart(2, "0")}`;
}

function entryBody(
  locale: VisualFixtureLocale,
  object: VisualFixtureObject,
  ordinal: number,
  globalIndex: number,
) {
  const sequence = String(globalIndex).padStart(2, "0");
  const bodyByLocale = {
    uk: [
      `${object.displayName}: коротка перевірка №${sequence}. Видимих проблем немає; наступний огляд за звичним графіком.`,
      `${object.displayName}: спостереження №${sequence}. Порівняв колір, пружність, апетит або активність із попереднім записом. Стан відповідає сезону, тому режим догляду не змінюю. Черговість в історії: ${ordinal}.`,
      `${object.displayName}: після сьогоднішнього догляду зафіксував стан №${sequence}. Нових пошкоджень не помітив, реакція на звичний режим спокійна.\n\nДо наступної перевірки залишаю лише одну змінну: час поливу, годування або огляду. Так буде зрозуміло, що саме вплинуло на результат.`,
      `Сезонна нотатка №${sequence} про ${object.displayName}. Температура й тривалість дня змінилися, але загальний стан стабільний. Перевірив опору, чистоту місця, доступ до води та ознаки стресу. Наступний запис зроблю після помітної зміни, а не за календарем.`,
      `${object.displayName}: детальна контрольна точка №${sequence}. Спочатку оглянув новий приріст або поведінку, потім порівняв нижню частину, місце утримання та сліди шкідників чи подразнення.\n\nРізких змін немає. Зберігаю поточний режим ще на один цикл і додам фото з тієї самої точки, щоб порівняння не залежало від ракурсу. Позиція в історії: ${ordinal}.`,
    ],
    bg: [
      `${object.displayName}: кратка проверка №${sequence}. Няма видими проблеми; следващият преглед остава по обичайния график.`,
      `${object.displayName}: наблюдение №${sequence}. Сравних цвета, устойчивостта, апетита или активността с предишната бележка. Състоянието отговаря на сезона, затова не променям режима на грижа. Поредност в историята: ${ordinal}.`,
      `${object.displayName}: след днешната грижа записах състояние №${sequence}. Не видях нови повреди и реакцията към обичайния режим е спокойна.\n\nДо следващата проверка оставям само една променлива: час на поливане, хранене или преглед. Така ще е ясно кое решение е повлияло на резултата.`,
      `Сезонна бележка №${sequence} за ${object.displayName}. Температурата и продължителността на деня се промениха, но общото състояние е стабилно. Проверих опората, чистотата на мястото, достъпа до вода и признаците на стрес. Следващият запис ще бъде при видима промяна, а не само по календар.`,
      `${object.displayName}: подробна контролна точка №${sequence}. Първо прегледах новия растеж или поведението, после сравних долната част, мястото за отглеждане и следите от вредители или раздразнение.\n\nНяма резки промени. Запазвам настоящия режим за още един цикъл и ще добавя снимка от същата точка, за да не зависи сравнението от ъгъла. Позиция в историята: ${ordinal}.`,
    ],
    ru: [
      `${object.displayName}: короткая проверка №${sequence}. Видимых проблем нет; следующий осмотр остаётся по обычному графику.`,
      `${object.displayName}: наблюдение №${sequence}. Сравнил цвет, упругость, аппетит или активность с предыдущей записью. Состояние соответствует сезону, поэтому режим ухода не меняю. Порядок в истории: ${ordinal}.`,
      `${object.displayName}: после сегодняшнего ухода зафиксировал состояние №${sequence}. Новых повреждений не заметил, реакция на привычный режим спокойная.\n\nДо следующей проверки оставляю только одну переменную: время полива, кормления или осмотра. Так будет понятно, какое решение повлияло на результат.`,
      `Сезонная запись №${sequence} про ${object.displayName}. Температура и длина дня изменились, но общее состояние стабильное. Проверил опору, чистоту места, доступ к воде и признаки стресса. Следующую запись сделаю после заметного изменения, а не только по календарю.`,
      `${object.displayName}: подробная контрольная точка №${sequence}. Сначала осмотрел новый рост или поведение, затем сравнил нижнюю часть, место содержания и следы вредителей либо раздражения.\n\nРезких изменений нет. Сохраняю текущий режим ещё на один цикл и добавлю фото с той же точки, чтобы сравнение не зависело от ракурса. Позиция в истории: ${ordinal}.`,
    ],
  } as const;
  const body = bodyByLocale[locale][(ordinal - 1) % 5];

  if (globalIndex !== 6) return body;

  const maximumLengthSource = `${body}\n\nЗа два тижні верхній шар ґрунту висихав нерівномірно, тому полив переніс на ранок і розділив на дві менші порції. Нові листки розгортаються без плям, нижні не втратили пружності, а опора більше не перетискає стебло.\n\nПорівняння з попередньою датою: приріст помітний, але не різкий; колір стабільний; слідів шкідників під листям не знайшов. Залишаю той самий режим ще на сім днів, щоб не змішувати вплив одразу кількох рішень.\n\nОкремо перевірив дренажні отвори, край контейнера й нижній бік листків. Застою води немає, запах ґрунту звичайний, дрібних комах або липких слідів не видно. Ці деталі фіксую зараз, щоб наступне порівняння спиралося не лише на загальне враження.\n\nПісля полудня порівняв температуру біля скла та в проході, перевірив тінь від сусідніх рослин і переконався, що листя не торкається гарячої поверхні. Провітрювання відкриваю поступово, без різкого протягу, а полив не поєдную з підживленням у той самий день.\n\nНа кожній китиці порахував зав'язь, позначив одну контрольну гілку м'якою стрічкою та перевірив, чи не змістилася опора після останнього підв'язування. Стиглі плоди зняв вчасно, пошкоджених або тріснутих не було.\n\nУвечері оглянув нижній бік листків при боковому світлі, протер полицю, прибрав сухі частини й записав фактичну витрату води. Запах, колір ґрунту та швидкість стікання залишилися звичними для цього контейнера.\n\nДля наступного порівняння залишаю незмінними об'єм горщика, склад суміші, положення опори й ранковий час огляду. Окремо перевірю вагу врожаю, інтервал між поливами, нову зав'язь і реакцію на коротше денне провітрювання.\n\nФінальний висновок сезону: рослина стабільна, зміни пояснюються погодою та навантаженням плодами, а не ознаками хвороби. Наступне рішення прийму лише після повторного огляду з тієї самої точки та порівняння фотографій.\n\nКонтрольну точку завершую без додаткового втручання: усі спостереження прив'язані до дат, фото й конкретних дій, тому наступний запис покаже реальну динаміку, а не випадкову різницю.`;

  return `${maximumLengthSource.slice(0, 1999)}…`;
}

function createTopicSignal(
  entry: VisualFixtureEntry,
  topic: VisualFixtureTopic,
  timestampIndex: number,
): VisualFixtureTopicSignal {
  return {
    journalEntryId: entry.id,
    topicId: topic.id,
    signalSource: "operator_curated",
    reviewState: "accepted",
    publicMembershipState: "eligible",
    createdAt: timestampForIndex(timestampIndex),
  };
}

function compareFeedEntries(
  left: VisualFixtureEntry,
  right: VisualFixtureEntry,
) {
  return (
    right.publishedAt!.localeCompare(left.publishedAt!) ||
    left.id.localeCompare(right.id)
  );
}

function buildJournalDirectoryEvidence(): VisualFixtureJournalDirectoryEvidence {
  const pageSize = 8 as const;
  const objectById = new Map(objects.map((object) => [object.id, object]));
  const topicBySlug = new Map(topics.map((topic) => [topic.slug, topic]));
  const entryIdsByTopic = new Map<string, Set<string>>();

  for (const signal of topicSignals) {
    const topic = topics.find((candidate) => candidate.id === signal.topicId);
    if (!topic) continue;
    const ids = entryIdsByTopic.get(topic.slug) ?? new Set<string>();
    ids.add(signal.journalEntryId);
    entryIdsByTopic.set(topic.slug, ids);
  }

  const forTopic = (slug: string) => {
    if (!topicBySlug.has(slug)) {
      throw new Error(`Visual fixture journal topic ${slug} is missing.`);
    }
    const ids = entryIdsByTopic.get(slug) ?? new Set<string>();
    return sortedPublicDirectoryEntries.filter((entry) => ids.has(entry.id));
  };
  const combinedEntries = sortedPublicDirectoryEntries.filter((entry) => {
    const object = objectById.get(entry.objectId);
    return (
      object?.objectKind === "bee_colony" &&
      object.locationVisibility === "region" &&
      object.coarseRegionCode === "BG-23" &&
      fixtureSeason(entry.entryDate) === "summer"
    );
  });
  const correctedQueryEntries = sortedPublicDirectoryEntries.filter((entry) =>
    objectById
      .get(entry.objectId)
      ?.displayName.toLocaleLowerCase("uk")
      .includes("черрі"),
  );
  const sparseEntries = forTopic("watering-and-moisture").filter(
    (entry) => objectById.get(entry.objectId)?.objectKind === "bee_colony",
  );
  const finalPage = Math.max(
    1,
    Math.ceil(sortedPublicDirectoryEntries.length / pageSize),
  );

  return {
    pageSize,
    authoredLocales: ["uk", "bg", "ru"],
    safeRegionCodes: ["UA-30", "BG-22", "BG-23"],
    hiddenRegionEntryCount: sortedPublicDirectoryEntries.filter(
      (entry) =>
        objectById.get(entry.objectId)?.locationVisibility === "hidden",
    ).length,
    queries: [
      journalDirectoryQuery(
        "default",
        "Default recent journals",
        "/journals",
        sortedPublicDirectoryEntries,
        1,
        pageSize,
      ),
      journalDirectoryQuery(
        "page-two",
        "Second complete result page",
        "/journals?page=2",
        sortedPublicDirectoryEntries,
        2,
        pageSize,
      ),
      journalDirectoryQuery(
        "page-size-minus-one",
        "Seven watering and moisture journals",
        "/journals?topic=watering-and-moisture",
        forTopic("watering-and-moisture"),
        1,
        pageSize,
      ),
      journalDirectoryQuery(
        "page-size",
        "Eight stress and recovery journals",
        "/journals?topic=stress-and-recovery",
        forTopic("stress-and-recovery"),
        1,
        pageSize,
      ),
      journalDirectoryQuery(
        "page-size-plus-one",
        "Nine season preparation journals",
        "/journals?topic=season-preparation",
        forTopic("season-preparation"),
        1,
        pageSize,
      ),
      journalDirectoryQuery(
        "sparse",
        "Sparse bee-colony topic result",
        "/ru/journals?kind=bee_colony&topic=watering-and-moisture",
        sparseEntries,
        1,
        pageSize,
      ),
      journalDirectoryQuery(
        "combined-safe-filters",
        "Bee journals in a public coarse region and summer",
        "/ru/journals?kind=bee_colony&season=summer&region=BG-23",
        combinedEntries,
        1,
        pageSize,
      ),
      journalDirectoryQuery(
        "zero-results",
        "No-result recovery",
        "/journals?q=visual-fixture-no-match",
        [],
        1,
        pageSize,
      ),
      journalDirectoryQuery(
        "corrected-query",
        "Corrected living-object query",
        "/journals?q=%D0%A7%D0%B5%D1%80%D1%80%D1%96",
        correctedQueryEntries,
        1,
        pageSize,
      ),
      journalDirectoryQuery(
        "reset",
        "Reset to default browse",
        "/journals",
        sortedPublicDirectoryEntries,
        1,
        pageSize,
      ),
      journalDirectoryQuery(
        "exhausted",
        "Final result page",
        `/journals?page=${finalPage}`,
        sortedPublicDirectoryEntries,
        finalPage,
        pageSize,
      ),
    ],
  };
}

function journalDirectoryQuery(
  id: string,
  label: string,
  path: string,
  entriesForQuery: readonly VisualFixtureEntry[],
  page: number,
  pageSize: number,
): VisualFixtureJournalDirectoryQueryEvidence {
  const pageEntries = entriesForQuery.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );
  const publicSlugs = pageEntries.map((entry) => {
    if (!entry.publicSlug) {
      throw new Error(`Directory evidence entry ${entry.id} is not public.`);
    }
    return entry.publicSlug;
  });

  return {
    id,
    label,
    path: appendVisualJournalCorpus(path),
    expectedCount: entriesForQuery.length,
    expectedOrderedEntryIds: pageEntries.map((entry) => entry.id),
    expectedOrderedPublicSlugs: publicSlugs,
  };
}

function appendVisualJournalCorpus(path: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}__visualJournals=corpus`;
}

function fixtureSeason(entryDate: string) {
  const month = Number(entryDate.slice(5, 7));
  if (month === 12 || month <= 2) return "winter";
  if (month <= 5) return "spring";
  if (month <= 8) return "summer";
  return "autumn";
}

function journalDirectoryEvidencePath(id: string) {
  const evidence = journalDirectoryEvidence.queries.find(
    (query) => query.id === id,
  );
  if (!evidence) {
    throw new Error(`Visual fixture journal directory case ${id} is missing.`);
  }
  return evidence.path;
}

function catalogSeed(
  id: string,
  canonicalName: string,
  publicSlug: string,
  catalogKind: VisualFixtureCatalogKind,
  locale: VisualFixtureCatalogLocale,
  status?: VisualFixtureCatalogStatus,
): CatalogSeedSpec {
  return {
    id,
    canonicalName,
    publicSlug,
    catalogKind,
    locale,
    ...(status ? { status } : {}),
  };
}

function normalizeCatalogName(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en");
}

function createSpace(
  index: number,
  actor: VisualFixtureActor,
  displayName: string,
  locationVisibility: "hidden" | "region",
  coarseRegionCode: string | null,
): VisualFixtureSpace {
  return {
    id: fixtureUuid(2, index),
    ownerUserId: actor.id,
    displayName,
    locationVisibility,
    coarseRegionCode,
    createdAt: timestampForIndex(index),
  };
}

function scenario(
  suffix: string,
  kind: VisualFixtureScenarioKind,
  label: string,
  path: string,
  expectedStatus: 200 | 404 | 410,
  expectedUiState?: "not_found",
): VisualFixtureScenario {
  return {
    id: `ove187-${suffix}`,
    kind,
    label,
    path,
    expectedStatus,
    ...(expectedUiState ? { expectedUiState } : {}),
    viewportTargets: ["desktop", "mobile-320"],
  };
}

function intentScenario(
  index: number,
  action: AuthIntentAction,
  label: string,
  state: VisualFixtureIntentState,
  returnTo: string,
  target?: AuthIntentTarget,
  tokenMode: VisualFixtureIntentScenario["tokenMode"] = "valid",
  expectedStatus: VisualFixtureIntentScenario["expectedStatus"] = 200,
): VisualFixtureIntentScenario {
  const draft = normalizeAuthIntentDraft({
    action,
    returnTo,
    ...(target ? { target } : {}),
  });
  const id = `ove174-i${String(index).padStart(3, "0")}`;

  return {
    id,
    action,
    label,
    state,
    returnTo: draft.returnTo,
    ...(draft.target ? { target: draft.target } : {}),
    startPath: `/__visual-fixtures/intent/${id}`,
    resumePath: buildAuthIntentResumeHref(draft),
    tokenMode,
    expectedStatus,
    viewportTargets: ["desktop", "mobile-320"],
  };
}

function coverageState(
  kind: VisualFixtureStateKind,
  label: string,
  detail: string,
  count: number,
  access: "public" | "owner",
  path: string | null,
): VisualFixtureStateCoverage {
  return {
    id: `ove187-state-${kind}`,
    kind,
    label,
    detail,
    count,
    access,
    path,
  };
}

function fixtureUuid(group: number, index: number) {
  return `1870000${group}-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function timestampForIndex(index: number) {
  return new Date(Date.UTC(2026, 0, 5, 9, index)).toISOString();
}

function dateDaysBefore(days: number) {
  const date = new Date(Date.UTC(2026, 6, 10));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function slugPart(value: string) {
  const normalized = value
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42)
    .replace(/-+$/g, "");
  return normalized || "living-object";
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function checkCount(
  errors: string[],
  label: string,
  actual: number,
  expected: number,
) {
  if (actual !== expected) {
    errors.push(`${label} expected ${expected}, received ${actual}.`);
  }
}

function checkUnique(errors: string[], label: string, values: string[]) {
  if (new Set(values).size !== values.length) {
    errors.push(`${label} must be unique.`);
  }
}
