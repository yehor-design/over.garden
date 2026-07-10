import { createHash } from "node:crypto";

export const VISUAL_FIXTURE_MANIFEST_VERSION = "ove187-v1";
export const VISUAL_FIXTURE_NAMESPACE =
  `visual-fixtures/${VISUAL_FIXTURE_MANIFEST_VERSION}` as const;

export type VisualFixtureLocale = "uk" | "bg" | "ru";
export type VisualFixtureObjectKind = "plant" | "animal" | "bee_colony";
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
  | "media-gallery";

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

export interface VisualFixtureScenario {
  id: string;
  kind: VisualFixtureScenarioKind;
  label: string;
  path: string;
  expectedStatus: 200 | 404 | 410;
  expectedUiState?: "not_found";
  viewportTargets: readonly ("desktop" | "mobile-320")[];
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
  objects: readonly VisualFixtureObject[];
  entries: readonly VisualFixtureEntry[];
  media: readonly VisualFixtureMedia[];
  stateCoverage: readonly VisualFixtureStateCoverage[];
  scenarios: readonly VisualFixtureScenario[];
}

const CREATED_AT_BASE = "2026-01-05T09:00:00.000Z";
const TOMATO_CATALOG_ID = "00000000-0000-4000-8000-000000000101";
const CUCUMBER_CATALOG_ID = "00000000-0000-4000-8000-000000000102";
const BG_TOMATO_CATALOG_ID = "00000000-0000-4000-8000-000000000103";

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
    catalogItemId: TOMATO_CATALOG_ID,
    varietyState: "selected",
  },
  {
    displayName: "Ніжинський огірок на шпалері",
    objectKind: "plant",
    spaceIndex: 2,
    catalogItemId: CUCUMBER_CATALOG_ID,
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
    varietyText: "Rosmarinus officinalis",
    varietyState: "free_text",
  },
  {
    displayName: "Домати за балконската решетка",
    objectKind: "plant",
    spaceIndex: 3,
    catalogItemId: BG_TOMATO_CATALOG_ID,
    varietyState: "selected",
  },
  {
    displayName: "Монстера до прозореца",
    objectKind: "plant",
    spaceIndex: 3,
    varietyState: "unknown",
  },
  {
    displayName: "Калатея с чувствителни листа",
    objectKind: "plant",
    spaceIndex: 3,
    varietyText: "Orbifolia",
    varietyState: "free_text",
  },
  {
    displayName: "Лимон от семка",
    objectKind: "plant",
    spaceIndex: 3,
    varietyText: "Домашен разсад",
    varietyState: "user_added",
  },
  {
    displayName: "Лавандула за опрашителите",
    objectKind: "plant",
    spaceIndex: 3,
    varietyState: "unknown",
  },
  {
    displayName: "Соняшник уздовж огорожі",
    objectKind: "plant",
    spaceIndex: 2,
    varietyText: "Високорослий місцевий",
    varietyState: "free_text",
  },
  {
    displayName: "Полуниця після поділу куща",
    objectKind: "plant",
    spaceIndex: 2,
    varietyText: "Ремонтантна без етикетки",
    varietyState: "free_text",
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
    varietyState: "unknown",
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
    varietyText: "Українська місцева",
    varietyState: "free_text",
  },
  {
    displayName: "Коза Хмарка після переїзду",
    objectKind: "animal",
    spaceIndex: 4,
    varietyState: "unknown",
  },
  {
    displayName: "Курка Ряба з відновленим пір'ям",
    objectKind: "animal",
    spaceIndex: 4,
    varietyText: "Домашня несучка",
    varietyState: "free_text",
  },
  {
    displayName: "Півень Граф",
    objectKind: "animal",
    spaceIndex: 4,
    varietyState: "unknown",
  },
  {
    displayName: "Кішка М'ята біля теплиці",
    objectKind: "animal",
    spaceIndex: 4,
    varietyText: "Безпородна",
    varietyState: "free_text",
  },
  {
    displayName: "Пес Бруно після реабілітації",
    objectKind: "animal",
    spaceIndex: 4,
    varietyText: "Метис",
    varietyState: "free_text",
  },
  {
    displayName: "Кролиця Лада",
    objectKind: "animal",
    spaceIndex: 4,
    varietyState: "unknown",
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
    varietyText: "Карпатская линия",
    varietyState: "free_text",
  },
  {
    displayName: "Семейство Липа",
    objectKind: "bee_colony",
    spaceIndex: 5,
    varietyText: "Местная линия",
    varietyState: "free_text",
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

const entryCountsByObject = [
  12,
  5,
  4,
  ...Array.from({ length: 14 }, () => 2),
  0,
  ...Array.from({ length: 7 }, () => 3),
  ...Array.from({ length: 5 }, () => 2),
] as const;

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
    objectIndex: 1,
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
    publicEntryOffset: 1,
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

const mediaEntryIds = new Set(media.map((item) => item.entryId));
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
const oneMediaEntries = entries.filter((entry) => mediaEntryIds.has(entry.id));

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
];

const activeEntry = entries.find(
  (entry) => entry.visibility === "public" && entry.lifecycleState === "active",
)!;
const goneEntry = entries.find((entry) => entry.publicGoneAt !== null)!;

const scenarios: readonly VisualFixtureScenario[] = [
  scenario(
    "index",
    "fixture-index",
    "Fixture overview",
    "/__visual-fixtures",
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
  objects,
  entries,
  media,
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
  checkCount(errors, "entries", manifest.entries.length, 80);
  checkCount(errors, "media", manifest.media.length, 16);

  const actorIds = new Set(manifest.actors.map((actor) => actor.id));
  const spaceIds = new Set(manifest.spaces.map((space) => space.id));
  const objectIds = new Set(manifest.objects.map((object) => object.id));
  const entryIds = new Set(manifest.entries.map((entry) => entry.id));
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
    "media entry ids",
    manifest.media.map((item) => item.entryId),
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
      const entryDate = dateDaysBefore((globalIndex - 1) * 3 + objectOffset);
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
