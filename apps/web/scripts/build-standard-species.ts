import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * The standard species base (OVE-530, ADR-0035 D3): the plants and animals
 * people grow or keep in Ukraine, Bulgaria and the neighbouring countries,
 * each with its everyday name and search words in uk, bg and ru and an exact
 * link to its catalogue organism, every field carrying its source.
 *
 *   pnpm exec tsx scripts/build-standard-species.ts [--offline]
 *
 * It reads only open sources, with a User-Agent and a pause between requests:
 *
 * - the Ukrainian State Register of Plant Varieties (CC BY 4.0), the one list
 *   of what is grown in Ukraine, with each crop's registered-cultivar count;
 * - Wikipedia categories in uk, bg and ru (houseplants, ornamentals,
 *   vegetables, fruit, domestic animals, aquarium fish …) as candidates;
 * - Wikidata (CC0) for the taxon, its identifiers and its labels, reached
 *   from an article only through the article's own Wikidata item;
 * - Wikipedia pageviews (the sixty days before the build, per language) as
 *   the popularity evidence, and the redirects to each article as search
 *   words.
 *
 * Every HTTP answer is cached under `node_modules/.cache/standard-species`
 * keyed by its URL, so a second run over the same cache reproduces the data
 * file byte for byte; `--offline` refuses to touch the network at all.
 * Hand decisions live in `data/standard-species/overrides.json`, each with
 * its reason; a name taken from the executor's own knowledge is marked for
 * review, never passed off as sourced.
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA_DIR = path.join(ROOT, "data", "standard-species");
const OUT_FILE = path.join(DATA_DIR, "standard-species.v1.json");
const OVERRIDES_FILE = path.join(DATA_DIR, "overrides.json");
const CACHE_DIR = path.join(ROOT, "node_modules", ".cache", "standard-species");
const OFFLINE = process.argv.includes("--offline");

const USER_AGENT =
  "OvergardenStandardSpecies/1.0 (+https://over.garden; open-data build script)";
/** At most this many requests in flight, each host's etiquette well inside it. */
const CONCURRENCY = 3;

export const STANDARD_BASE_VERSION = "2026-09-26";
/**
 * Wikipedia's own pageview counter (the PageViewInfo API), read fifty
 * articles at a time: the last sixty days before the build's first request.
 * The per-article REST endpoint answers 429 to a build this size.
 */
const PAGEVIEW_DAYS = 60;
const PAGEVIEW_WINDOW = `the ${PAGEVIEW_DAYS} days before ${STANDARD_BASE_VERSION}`;

const REGISTER_URL =
  "https://data.gov.ua/dataset/eabd0bd2-2dc6-47e2-b748-9bd254da4956/resource/32ea0f72-86e4-490d-9ab9-4d64976187c6/download/2025-07-15_registervarietis.csv";

type Lang = "uk" | "bg" | "ru";
const LANGS: Lang[] = ["uk", "bg", "ru"];
type Kind = "plant" | "animal";

export type StandardGroup =
  | "vegetables"
  | "fruit"
  | "berries"
  | "herbs"
  | "flowers"
  | "houseplants"
  | "trees_shrubs"
  | "field_crops"
  | "poultry"
  | "livestock"
  | "pets"
  | "bees"
  | "fish"
  | "reptiles"
  | "birds"
  | "other_animals";

/**
 * Where a candidate can come from, with the kind and group it suggests. A
 * category is followed one level into its subcategories.
 */
const CATEGORY_SOURCES: Array<{
  lang: Lang;
  title: string;
  kind: Kind;
  group: StandardGroup;
  depth: 0 | 1;
}> = [
  // Only categories of things people grow or keep. Food categories (fruit,
  // spices as merchandise), wild flora and "domestic animals" in the broad
  // sense brought in mangosteen, belladonna and the golden eagle, so the
  // animals and the everyday garden flowers come from the curated candidate
  // list instead (`data/standard-species/overrides.json`).
  { lang: "uk", title: "Категорія:Кімнатні рослини", kind: "plant", group: "houseplants", depth: 1 },
  { lang: "ru", title: "Категория:Комнатные растения", kind: "plant", group: "houseplants", depth: 1 },
  { lang: "bg", title: "Категория:Стайни растения", kind: "plant", group: "houseplants", depth: 1 },
  { lang: "ru", title: "Категория:Декоративные садовые растения", kind: "plant", group: "flowers", depth: 1 },
  { lang: "uk", title: "Категорія:Овочі", kind: "plant", group: "vegetables", depth: 1 },
  { lang: "ru", title: "Категория:Овощи", kind: "plant", group: "vegetables", depth: 1 },
  { lang: "bg", title: "Категория:Зеленчуци", kind: "plant", group: "vegetables", depth: 1 },
  { lang: "uk", title: "Категорія:Плодові дерева", kind: "plant", group: "fruit", depth: 1 },
  { lang: "ru", title: "Категория:Плодовые деревья", kind: "plant", group: "fruit", depth: 1 },
  { lang: "uk", title: "Категорія:Ягоди", kind: "plant", group: "berries", depth: 1 },
  { lang: "ru", title: "Категория:Ягоды", kind: "plant", group: "berries", depth: 1 },
  { lang: "uk", title: "Категорія:Прянощі", kind: "plant", group: "herbs", depth: 1 },
  { lang: "ru", title: "Категория:Пряности", kind: "plant", group: "herbs", depth: 1 },
  { lang: "uk", title: "Категорія:Акваріумні риби", kind: "animal", group: "fish", depth: 0 },
  { lang: "ru", title: "Категория:Аквариумные рыбы", kind: "animal", group: "fish", depth: 0 },
];

/** The register's crop groups, by the group the base files them under. */
const REGISTER_GROUPS: Record<string, StandardGroup> = {
  "Agricultural: Vegetable": "vegetables",
  "Agricultural: Potato": "vegetables",
  "Agricultural: Beet": "vegetables",
  "Fruit and Berry": "fruit",
  Grapevine: "fruit",
  // The register's group mixes garden flowers with medicinal crops; the
  // flowers are named in the curated list, so the group defaults to herbs.
  "Ornamental and Healing": "herbs",
  Forest: "trees_shrubs",
  "Agricultural: Field cereal": "field_crops",
  "Agricultural: Oil and Fibre": "field_crops",
  "Agricultural: Fodder": "field_crops",
  "Agricultural: Field pulse": "field_crops",
  "Agricultural: Field groats": "field_crops",
};

/**
 * A candidate that did not come from the register enters only with this much
 * reading behind it, summed over the pageview window, in at least one
 * language: about ten readers a day in Ukrainian, three in Bulgarian and fifty
 * in Russian, whose Wikipedia is read five times as much.
 * Stated once and applied to every candidate alike.
 */
export const PAGEVIEW_THRESHOLDS: Record<Lang, number> = {
  uk: 600,
  bg: 200,
  ru: 3_000,
};

/** Wikidata ranks a base row may be: a species or a named rank below it. */
const GENUS_RANK = "Q34740";
const ALLOWED_RANKS: Record<string, string> = {
  Q7432: "species",
  Q68947: "subspecies",
  Q767728: "variety",
  Q279749: "form",
  Q42621: "hybrid",
  Q1306176: "nothospecies",
};

// ---------------------------------------------------------------------------
// Output shape

export interface StandardName {
  display: string;
  displaySource: string;
  search: string[];
  status: "confirmed" | "review" | "single_source";
  evidence: string[];
}

export interface StandardSpeciesRow {
  key: string;
  kind: Kind;
  group: StandardGroup;
  latin: string;
  rank: string;
  wikidata: string;
  identifiers: {
    gbif: string | null;
    col: string | null;
    wfo: string | null;
    eppo: string[];
  };
  parentLatin: string | null;
  names: Record<Lang, StandardName>;
  popularity: {
    registerCultivars: number;
    pageviews: Record<Lang, number>;
  };
  sources: string[];
  notes: string[];
  /** Other spellings of the Latin name, as the register writes them, for the loader. */
  latinSynonyms: string[];
}

interface NameOverride {
  display?: Partial<Record<Lang, string>>;
  search?: Partial<Record<Lang, string[]>>;
  /** Pages researched by hand that name the organism so, one per independent site. */
  evidence?: Partial<Record<Lang, string[]>>;
}

/**
 * The hand decisions, each with its reason. A curated candidate is the
 * executor's own knowledge of what people keep; it enters the base as a
 * candidate and its names are still checked against the sources — a name no
 * source carries is marked for review, never passed off as sourced.
 */
interface Overrides {
  candidates: Array<
    NameOverride & {
      latin?: string;
      wikidata?: string;
      kind: Kind;
      group: StandardGroup;
      /** A genus stands for its species where people never name one (roses, lilies, orchids). */
      allowGenus?: boolean;
      reason: string;
    }
  >;
  exclude: Array<{ wikidata: string; reason: string }>;
  /** A row that is another row's everyday concept: its names become the target's search words. */
  aliasOf: Array<{ wikidata: string; target: string; reason: string }>;
  /**
   * Register crops the Wikidata lookup cannot find under the register's own
   * spelling (a typo, a synonym): the register's key → the accepted Latin name.
   */
  registerLinks: Record<string, string>;
  rows: Record<string, NameOverride & { group?: StandardGroup; kind?: Kind; reason: string }>;
}

// ---------------------------------------------------------------------------
// HTTP with a cache

let inFlight = 0;
let fetched = 0;
const waiting: Array<() => void> = [];

async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (inFlight >= CONCURRENCY) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  inFlight += 1;
  try {
    return await work();
  } finally {
    inFlight -= 1;
    waiting.shift()?.();
  }
}

/** Run `work` over every item, CONCURRENCY at a time, in input order. */
async function mapPool<T, R>(items: T[], work: (item: T) => Promise<R>): Promise<R[]> {
  return Promise.all(items.map((item) => work(item)));
}

async function cachedText(url: string, accept = "application/json"): Promise<string> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const key = createHash("sha256").update(`${accept} ${url}`).digest("hex");
  const file = path.join(CACHE_DIR, `${key}.txt`);
  if (existsSync(file)) return readFileSync(file, "utf8");
  if (OFFLINE) throw new Error(`offline and not cached: ${url}`);
  for (let attempt = 1; ; attempt += 1) {
    let response: Response;
    try {
      response = await slot(() =>
        fetch(url, {
          headers: { "user-agent": USER_AGENT, accept },
          signal: AbortSignal.timeout(90_000),
        }),
      );
    } catch (error) {
      if (attempt >= 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt >= 10) throw new Error(`${response.status} after ${attempt} tries: ${url}`);
      // The API says how long to wait; without a word, back off further each time.
      const retryAfter = Number(response.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : 5_000 * attempt;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    if (response.status === 404) {
      writeFileSync(file, "");
      return "";
    }
    if (!response.ok) throw new Error(`${response.status}: ${url}`);
    const text =
      url === REGISTER_URL
        ? new TextDecoder("utf-16le").decode(await response.arrayBuffer())
        : await response.text();
    writeFileSync(file, text);
    fetched += 1;
    if (fetched % 100 === 0) process.stderr.write(`… ${fetched} requests\n`);
    return text;
  }
}

async function cachedJson<T>(url: string): Promise<T | null> {
  const text = await cachedText(url);
  return text ? (JSON.parse(text) as T) : null;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

// ---------------------------------------------------------------------------
// The register

interface RegisterCrop {
  latinKeys: string[];
  ukName: string;
  groupEn: string;
  cultivars: number;
}

/** "Beta vulgaris L. ssp. vulgaris var. altissima Dоell" → the names to try. */
export function registerLatinKeys(raw: string): string[] {
  const cleaned = raw
    .replace(/[Ѐ-ӿ]/gu, (char) => CYRILLIC_LOOKALIKES[char] ?? "")
    .replace(/\s+/gu, " ")
    .trim();
  const tokens = cleaned.split(" ");
  let genus = tokens[0] ?? "";
  let index = 1;
  let hybrid = false;
  if (tokens[index] === "×" || tokens[index] === "x") {
    hybrid = true;
    index += 1;
  }
  const epithet = (tokens[index] ?? "").toLowerCase();
  if (!/^[A-Z][a-z]+$/u.test(genus) || !/^[a-z-]+$/u.test(epithet)) return [];
  genus = genus.trim();
  const binomials = hybrid
    ? [`${genus} × ${epithet}`, `${genus} ×${epithet}`]
    : [`${genus} ${epithet}`, `${genus} × ${epithet}`, `${genus} ×${epithet}`];
  const keys: string[] = [];
  const infra: Array<[string, string]> = [];
  for (let at = index + 1; at < tokens.length - 1; at += 1) {
    const marker = tokens[at]!.toLowerCase();
    const next = tokens[at + 1]!;
    if (!/^[a-z-]+$/u.test(next)) continue;
    if (marker === "var." || marker === "var") infra.push(["var.", next]);
    else if (marker === "ssp." || marker === "subsp.") infra.push(["subsp.", next]);
    else if (marker === "convar.") infra.push(["convar.", next]);
    else if (marker === "f.") infra.push(["f.", next]);
  }
  for (const binomial of binomials) {
    for (const [marker, name] of [...infra].reverse()) {
      keys.push(`${binomial} ${marker} ${name}`);
    }
  }
  keys.push(...binomials);
  return [...new Set(keys)];
}

const CYRILLIC_LOOKALIKES: Record<string, string> = {
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y",
  "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O",
  "Р": "P", "С": "C", "Т": "T", "Х": "X",
};

function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  const body = text.replace(/^﻿/u, "");
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]!;
    if (quoted) {
      if (char === '"') {
        if (body[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && body[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...data] = rows;
  return data.map((values) =>
    Object.fromEntries(header!.map((name, at) => [name, values[at] ?? ""])),
  );
}

async function readRegister(): Promise<RegisterCrop[]> {
  const rows = parseCsv(await cachedText(REGISTER_URL, "text/csv"));
  const crops = new Map<string, RegisterCrop>();
  for (const row of rows) {
    const keys = registerLatinKeys(row.taxonNameLat ?? "");
    if (!keys.length) continue;
    const ukName = (row.taxonName ?? "")
      .replace(/\s*-\s*батьківський компонент/giu, "")
      .replace(/\s*\((?:ярий|ярої|озимий|озима|озиме)[^)]*\)/giu, "")
      .trim();
    const id = keys[0]!;
    const crop = crops.get(id) ?? {
      latinKeys: keys,
      ukName,
      groupEn: row.taxonGroupNameEn ?? "",
      cultivars: 0,
    };
    crop.cultivars += 1;
    crops.set(id, crop);
  }
  return [...crops.values()];
}

// ---------------------------------------------------------------------------
// Wikipedia

interface CategoryMember {
  lang: Lang;
  title: string;
  kind: Kind;
  group: StandardGroup;
  source: string;
}

async function categoryMembers(
  lang: Lang,
  title: string,
  types: "page" | "subcat",
): Promise<string[]> {
  const titles: string[] = [];
  let cont: string | undefined;
  do {
    const params = new URLSearchParams({
      action: "query",
      list: "categorymembers",
      cmtitle: title,
      cmlimit: "500",
      cmtype: types,
      cmnamespace: types === "page" ? "0" : "14",
      format: "json",
      formatversion: "2",
    });
    if (cont) params.set("cmcontinue", cont);
    const data = await cachedJson<{
      query?: { categorymembers: Array<{ title: string }> };
      continue?: { cmcontinue: string };
    }>(`https://${lang}.wikipedia.org/w/api.php?${params}`);
    titles.push(...(data?.query?.categorymembers.map((member) => member.title) ?? []));
    cont = data?.continue?.cmcontinue;
  } while (cont);
  return titles;
}

async function collectCategoryCandidates(log: string[]): Promise<CategoryMember[]> {
  const perSource = await mapPool(CATEGORY_SOURCES, async (source) => {
    const categories = [source.title];
    if (source.depth === 1) {
      categories.push(...(await categoryMembers(source.lang, source.title, "subcat")));
    }
    const pages = await mapPool(categories, (category) =>
      categoryMembers(source.lang, category, "page"),
    );
    return pages.flat().map((title) => ({
      lang: source.lang,
      title,
      kind: source.kind,
      group: source.group,
      source: `${source.lang}wiki:${source.title}`,
    }));
  });
  CATEGORY_SOURCES.forEach((source, at) =>
    log.push(`${source.lang}wiki ${source.title}: ${perSource[at]!.length} articles`),
  );
  return perSource.flat();
}

/** Article titles → their Wikidata items, fifty at a time. */
async function articleItems(lang: Lang, titles: string[]): Promise<Map<string, string>> {
  const items = new Map<string, string>();
  for (const batch of chunks([...new Set(titles)], 50)) {
    const params = new URLSearchParams({
      action: "query",
      prop: "pageprops",
      ppprop: "wikibase_item",
      redirects: "1",
      titles: batch.join("|"),
      format: "json",
      formatversion: "2",
    });
    const data = await cachedJson<{
      query?: {
        pages: Array<{ title: string; pageprops?: { wikibase_item?: string } }>;
        redirects?: Array<{ from: string; to: string }>;
        normalized?: Array<{ from: string; to: string }>;
      };
    }>(`https://${lang}.wikipedia.org/w/api.php?${params}`);
    const byTitle = new Map<string, string>();
    for (const page of data?.query?.pages ?? []) {
      if (page.pageprops?.wikibase_item) byTitle.set(page.title, page.pageprops.wikibase_item);
    }
    const alias = new Map<string, string>();
    for (const step of [...(data?.query?.normalized ?? []), ...(data?.query?.redirects ?? [])]) {
      alias.set(step.from, step.to);
    }
    for (const title of batch) {
      let target = title;
      for (let hop = 0; hop < 3 && alias.has(target); hop += 1) target = alias.get(target)!;
      const item = byTitle.get(target);
      if (item) items.set(title, item);
    }
  }
  return items;
}

/** The redirects to each article: the words people search it by. */
async function articleRedirects(lang: Lang, titles: string[]): Promise<Map<string, string[]>> {
  const redirects = new Map<string, string[]>();
  for (const batch of chunks([...new Set(titles)], 50)) {
    let cont: Record<string, string> | undefined;
    do {
      const params = new URLSearchParams({
        action: "query",
        prop: "redirects",
        rdlimit: "max",
        rdnamespace: "0",
        titles: batch.join("|"),
        format: "json",
        formatversion: "2",
        ...(cont ?? {}),
      });
      const data = await cachedJson<{
        query?: { pages: Array<{ title: string; redirects?: Array<{ title: string }> }> };
        continue?: Record<string, string>;
      }>(`https://${lang}.wikipedia.org/w/api.php?${params}`);
      for (const page of data?.query?.pages ?? []) {
        const list = redirects.get(page.title) ?? [];
        list.push(...(page.redirects?.map((redirect) => redirect.title) ?? []));
        redirects.set(page.title, list);
      }
      cont = data?.continue;
    } while (cont);
  }
  return redirects;
}

async function pageviews(lang: Lang, titles: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const batches = chunks([...new Set(titles)].sort(), 50);
  type PageviewAnswer = {
    query?: {
      pages: Array<{ title: string; pageviews?: Record<string, number | null> }>;
      normalized?: Array<{ from: string; to: string }>;
    };
    continue?: Record<string, string>;
  };
  // The API fills a few pages per answer and continues with `pvipcontinue`;
  // a page it has not filled yet carries no `pageviews` at all.
  const answers = (
    await mapPool(batches, async (batch) => {
      const parts: PageviewAnswer[] = [];
      let cont: Record<string, string> | undefined;
      do {
        const params = new URLSearchParams({
          action: "query",
          prop: "pageviews",
          pvipdays: String(PAGEVIEW_DAYS),
          titles: batch.join("|"),
          format: "json",
          formatversion: "2",
          ...(cont ?? {}),
        });
        const part = await cachedJson<PageviewAnswer>(
          `https://${lang}.wikipedia.org/w/api.php?${params}`,
        );
        if (part) parts.push(part);
        cont = part?.continue;
      } while (cont);
      return parts;
    })
  ).flat();
  for (const data of answers) {
    const normalized = new Map(
      (data?.query?.normalized ?? []).map((step) => [step.to, step.from]),
    );
    for (const page of data?.query?.pages ?? []) {
      if (!page.pageviews) continue;
      const total = Object.values(page.pageviews).reduce<number>(
        (sum, value) => sum + (value ?? 0),
        0,
      );
      counts.set(normalized.get(page.title) ?? page.title, total);
    }
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Wikidata

interface Entity {
  id: string;
  labels: Partial<Record<Lang | "en", string>>;
  aliases: Partial<Record<Lang, string[]>>;
  sitelinks: Partial<Record<Lang, string>>;
  taxonName: string | null;
  rank: string | null;
  gbif: string | null;
  col: string | null;
  wfo: string | null;
  eppo: string[];
  productOf: string[];
  parentTaxon: string | null;
  instanceOf: string[];
}

interface RawClaim {
  mainsnak: { datavalue?: { value: unknown } };
  rank?: string;
}

function claimValues(claims: Record<string, RawClaim[]> | undefined, property: string): unknown[] {
  return (claims?.[property] ?? [])
    .filter((claim) => claim.rank !== "deprecated")
    .map((claim) => claim.mainsnak.datavalue?.value)
    .filter((value) => value !== undefined);
}

function claimItemIds(claims: Record<string, RawClaim[]> | undefined, property: string): string[] {
  return claimValues(claims, property)
    .map((value) => (value as { id?: string }).id)
    .filter((id): id is string => typeof id === "string");
}

function claimStrings(claims: Record<string, RawClaim[]> | undefined, property: string): string[] {
  return claimValues(claims, property).filter((value): value is string => typeof value === "string");
}

async function fetchEntities(ids: string[]): Promise<Map<string, Entity>> {
  const entities = new Map<string, Entity>();
  const batches = chunks([...new Set(ids)].sort(), 50);
  const answers = await mapPool(batches, async (batch) => {
    const params = new URLSearchParams({
      action: "wbgetentities",
      ids: batch.join("|"),
      props: "labels|aliases|claims|sitelinks",
      languages: "uk|bg|ru|en",
      sitefilter: "ukwiki|bgwiki|ruwiki",
      format: "json",
    });
    const data = await cachedJson<{
      entities?: Record<
        string,
        {
          id: string;
          missing?: string;
          redirects?: { to: string };
          labels?: Record<string, { value: string }>;
          aliases?: Record<string, Array<{ value: string }>>;
          sitelinks?: Record<string, { title: string }>;
          claims?: Record<string, RawClaim[]>;
        }
      >;
    }>(`https://www.wikidata.org/w/api.php?${params}`);
    return data;
  });
  for (const data of answers) {
    for (const [requested, raw] of Object.entries(data?.entities ?? {})) {
      if (raw.missing !== undefined) continue;
      const entity: Entity = {
        id: raw.id,
        labels: Object.fromEntries(
          Object.entries(raw.labels ?? {}).map(([lang, label]) => [lang, label.value]),
        ),
        aliases: Object.fromEntries(
          Object.entries(raw.aliases ?? {}).map(([lang, list]) => [lang, list.map((alias) => alias.value)]),
        ),
        sitelinks: {
          ...(raw.sitelinks?.ukwiki ? { uk: raw.sitelinks.ukwiki.title } : {}),
          ...(raw.sitelinks?.bgwiki ? { bg: raw.sitelinks.bgwiki.title } : {}),
          ...(raw.sitelinks?.ruwiki ? { ru: raw.sitelinks.ruwiki.title } : {}),
        },
        taxonName: claimStrings(raw.claims, "P225")[0] ?? null,
        rank: claimItemIds(raw.claims, "P105")[0] ?? null,
        gbif: claimStrings(raw.claims, "P846")[0] ?? null,
        col: claimStrings(raw.claims, "P10585")[0] ?? null,
        wfo: claimStrings(raw.claims, "P7715")[0] ?? null,
        eppo: claimStrings(raw.claims, "P3031"),
        productOf: claimItemIds(raw.claims, "P1582"),
        parentTaxon: claimItemIds(raw.claims, "P171")[0] ?? null,
        instanceOf: claimItemIds(raw.claims, "P31"),
      };
      entities.set(requested, entity);
      entities.set(entity.id, entity);
    }
  }
  return entities;
}

/** Register names → the Wikidata items that carry them as taxon name. */
async function itemsByTaxonName(names: string[]): Promise<Map<string, string[]>> {
  const found = new Map<string, string[]>();
  for (const batch of chunks([...new Set(names)].sort(), 60)) {
    const values = batch.map((name) => JSON.stringify(name)).join(" ");
    const query = `SELECT ?item ?name WHERE { VALUES ?name { ${values} } ?item wdt:P225 ?name . FILTER(STRSTARTS(STR(?item), "http://www.wikidata.org/entity/Q")) }`;
    const data = await cachedJson<{
      results: { bindings: Array<{ item: { value: string }; name: { value: string } }> };
    }>(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`);
    for (const binding of data?.results.bindings ?? []) {
      const list = found.get(binding.name.value) ?? [];
      list.push(binding.item.value.replace("http://www.wikidata.org/entity/", ""));
      found.set(binding.name.value, list);
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Names

const DISAMBIGUATION = /\s*\([^)]*\)\s*$/u;

/** A name as a person would write it: no qualifier, sentence case. */
export function everydayForm(value: string, lang: Lang): string {
  const trimmed = value.replace(DISAMBIGUATION, "").replace(/\s+/gu, " ").trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toLocaleUpperCase(lang) + trimmed.slice(1);
}

/** The comparison form: case, ё and apostrophes do not tell two names apart. */
export function nameKey(value: string): string {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("uk")
    .replace(/ё/gu, "е")
    .replace(/[ʼ’'`]/gu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

function isCyrillicName(value: string): boolean {
  return /\p{Script=Cyrillic}/u.test(value) && !/[:/]/u.test(value) && value.length <= 60;
}

// ---------------------------------------------------------------------------
// Assembly

interface Concept {
  taxon: Entity;
  articles: Entity[];
  kind: Kind | null;
  groups: StandardGroup[];
  register: RegisterCrop[];
  sources: Set<string>;
  curated: Overrides["candidates"][number] | null;
}

async function main() {
  const log: string[] = [];
  const overrides = JSON.parse(readFileSync(OVERRIDES_FILE, "utf8")) as Overrides;
  const excluded = new Set(overrides.exclude.map((entry) => entry.wikidata));
  const aliasTargets = new Map(overrides.aliasOf.map((entry) => [entry.wikidata, entry.target]));

  // 1. Candidates: the register, the categories, the curated list.
  const register = await readRegister();
  log.push(`register: ${register.length} crops`);
  const registerKeys = register.flatMap((crop) => crop.latinKeys);
  const curatedLatin = overrides.candidates
    .filter((candidate) => !candidate.wikidata && candidate.latin)
    .map((candidate) => candidate.latin!);
  const taxonItems = await itemsByTaxonName([
    ...registerKeys,
    ...curatedLatin,
    ...Object.values(overrides.registerLinks),
  ]);

  const categoryCandidates = await collectCategoryCandidates(log);
  const articleItemIds = new Map<string, string>();
  for (const lang of LANGS) {
    const titles = categoryCandidates.filter((member) => member.lang === lang).map((member) => member.title);
    for (const [title, item] of await articleItems(lang, titles)) {
      articleItemIds.set(`${lang}:${title}`, item);
    }
  }

  const firstIds = new Set<string>([
    ...[...taxonItems.values()].flat(),
    ...articleItemIds.values(),
    ...overrides.candidates.flatMap((candidate) => (candidate.wikidata ? [candidate.wikidata] : [])),
    ...overrides.aliasOf.flatMap((entry) => [entry.wikidata, entry.target]),
  ]);
  const entities = await fetchEntities([...firstIds]);
  // Articles about a crop are often about the food, not the plant: follow the
  // item to the taxon it is a natural product of (P1582).
  const productTargets = [...entities.values()].flatMap((entity) =>
    entity.taxonName ? [] : entity.productOf,
  );
  for (const [id, entity] of await fetchEntities(productTargets.filter((id) => !entities.has(id)))) {
    entities.set(id, entity);
  }

  const genusAllowed = new Set<string>();
  const concepts = new Map<string, Concept>();
  const conceptFor = (taxon: Entity) => {
    const existing = concepts.get(taxon.id);
    if (existing) return existing;
    const created: Concept = {
      taxon,
      articles: [taxon],
      kind: null,
      groups: [],
      register: [],
      sources: new Set(),
      curated: null,
    };
    concepts.set(taxon.id, created);
    return created;
  };
  // A curated item named by its Wikidata id is taken at its word: some
  // cultivated hybrids carry a taxon name and no rank at all.
  const curatedIds = new Set(
    overrides.candidates.flatMap((candidate) => (candidate.wikidata ? [candidate.wikidata] : [])),
  );
  const allowedRank = (entity: Entity) =>
    Boolean(
      (entity.rank && (ALLOWED_RANKS[entity.rank] || (entity.rank === GENUS_RANK && genusAllowed.has(entity.id)))) ||
        (curatedIds.has(entity.id) && entity.rank !== GENUS_RANK),
    );
  const taxonOf = (entity: Entity): Entity | null => {
    if (entity.taxonName && allowedRank(entity)) return entity;
    if (!entity.taxonName && entity.productOf.length === 1) {
      const target = entities.get(entity.productOf[0]!);
      if (target?.taxonName && allowedRank(target)) return target;
    }
    return null;
  };
  const pickByName = (keys: string[]): Entity | null => {
    for (const key of keys) {
      const candidates = (taxonItems.get(key) ?? [])
        .map((id) => entities.get(id))
        .filter((entity): entity is Entity => Boolean(entity && taxonOf(entity)))
        .sort(
          (left, right) =>
            Object.keys(right.sitelinks).length - Object.keys(left.sitelinks).length ||
            left.id.localeCompare(right.id),
        );
      if (candidates[0]) return candidates[0];
    }
    return null;
  };

  // The curated list first: its kind and group win over a category's guess.
  for (const candidate of overrides.candidates) {
    const direct = candidate.wikidata ? entities.get(candidate.wikidata) : undefined;
    if (candidate.allowGenus && direct) genusAllowed.add(direct.id);
    if (candidate.allowGenus && candidate.latin) {
      for (const id of taxonItems.get(candidate.latin) ?? []) genusAllowed.add(id);
    }
    const chosen = direct ?? (candidate.latin ? pickByName([candidate.latin]) : null);
    if (candidate.allowGenus && chosen) genusAllowed.add(chosen.id);
    if (!chosen || !taxonOf(chosen)) {
      log.push(`curated: no Wikidata taxon for ${candidate.wikidata ?? candidate.latin}`);
      continue;
    }
    const concept = conceptFor(taxonOf(chosen)!);
    concept.kind = candidate.kind;
    concept.groups.unshift(candidate.group);
    concept.curated = candidate;
    concept.sources.add("curated_candidates");
  }

  for (const crop of register) {
    const linked = overrides.registerLinks[crop.latinKeys[0]!];
    const chosen = pickByName(linked ? [linked] : crop.latinKeys);
    if (!chosen || !taxonOf(chosen)) {
      log.push(`register: no Wikidata taxon for ${crop.latinKeys[0]} (${crop.ukName})`);
      continue;
    }
    const concept = conceptFor(taxonOf(chosen)!);
    concept.kind ??= "plant";
    concept.register.push(crop);
    concept.groups.push(REGISTER_GROUPS[crop.groupEn] ?? "field_crops");
    concept.sources.add("ua_state_register");
  }

  for (const member of categoryCandidates) {
    const itemId = articleItemIds.get(`${member.lang}:${member.title}`);
    const entity = itemId ? entities.get(itemId) : undefined;
    if (!entity) continue;
    const taxon = taxonOf(entity);
    if (!taxon) continue;
    const concept = conceptFor(taxon);
    if (entity.id !== taxon.id && !concept.articles.some((article) => article.id === entity.id)) {
      concept.articles.push(entity);
    }
    concept.kind ??= member.kind;
    concept.groups.push(member.group);
    concept.sources.add(member.source);
  }

  // An alias's articles, register crops and sources join its target concept.
  for (const [aliasId, targetId] of aliasTargets) {
    const alias = concepts.get(aliasId);
    const targetEntity = entities.get(targetId);
    if (!alias || !targetEntity) continue;
    const target = conceptFor(taxonOf(targetEntity) ?? targetEntity);
    for (const article of alias.articles) {
      if (!target.articles.some((known) => known.id === article.id)) target.articles.push(article);
    }
    target.register.push(...alias.register);
    for (const source of alias.sources) target.sources.add(source);
    concepts.delete(aliasId);
  }

  // 2. Evidence: pageviews and redirects of every article of every concept.
  const titlesByLang: Record<Lang, Set<string>> = { uk: new Set(), bg: new Set(), ru: new Set() };
  for (const concept of concepts.values()) {
    for (const article of concept.articles) {
      for (const lang of LANGS) {
        const title = article.sitelinks[lang];
        if (title) titlesByLang[lang].add(title);
      }
    }
  }
  const views = new Map<string, number>();
  const redirects = new Map<string, string[]>();
  for (const lang of LANGS) {
    const titles = [...titlesByLang[lang]].sort();
    const counts = await pageviews(lang, titles);
    for (const title of titles) views.set(`${lang}:${title}`, counts.get(title) ?? 0);
    for (const [title, list] of await articleRedirects(lang, titles)) {
      redirects.set(`${lang}:${title}`, list);
    }
  }

  // 3. Rows.
  const drafts: Array<{ concept: Concept; row: StandardSpeciesRow }> = [];
  for (const concept of [...concepts.values()].sort((a, b) => a.taxon.id.localeCompare(b.taxon.id))) {
    const taxon = concept.taxon;
    if (excluded.has(taxon.id)) continue;
    const override = overrides.rows[taxon.id];
    const pv = Object.fromEntries(
      LANGS.map((lang) => [
        lang,
        concept.articles.reduce(
          (sum, article) => sum + (views.get(`${lang}:${article.sitelinks[lang]}`) ?? 0),
          0,
        ),
      ]),
    ) as Record<Lang, number>;
    const fromRegister = concept.register.length > 0;
    const popular = LANGS.some((lang) => pv[lang] >= PAGEVIEW_THRESHOLDS[lang]);
    if (!fromRegister && !concept.curated && !popular) continue;
    const kind = override?.kind ?? concept.kind ?? "plant";
    const group =
      override?.group ?? concept.curated?.group ?? mostCommon(concept.groups) ?? "vegetables";

    const names = {} as Record<Lang, StandardName>;
    for (const lang of LANGS) {
      names[lang] = buildName(lang, concept, views, redirects, {
        display: override?.display?.[lang] ?? concept.curated?.display?.[lang],
        search: [...(concept.curated?.search?.[lang] ?? []), ...(override?.search?.[lang] ?? [])],
        evidence: [...(concept.curated?.evidence?.[lang] ?? []), ...(override?.evidence?.[lang] ?? [])],
      });
    }
    drafts.push({
      concept,
      row: {
        key: `${kind}:${slugOf(taxon.taxonName!)}`,
        kind,
        group,
        latin: taxon.taxonName!,
        rank: taxon.rank === GENUS_RANK ? "genus" : (ALLOWED_RANKS[taxon.rank ?? ""] ?? "species"),
        wikidata: taxon.id,
        identifiers: {
          gbif: taxon.gbif,
          col: taxon.col,
          wfo: taxon.wfo,
          eppo: [...new Set(concept.articles.flatMap((article) => article.eppo))].sort(),
        },
        parentLatin: null,
        latinSynonyms: [
          ...new Set(
            concept.register
              .flatMap((crop) => crop.latinKeys)
              .filter((key) => nameKey(key) !== nameKey(taxon.taxonName!)),
          ),
        ].sort(),
        names,
        popularity: {
          registerCultivars: concept.register.reduce((sum, crop) => sum + crop.cultivars, 0),
          pageviews: pv,
        },
        sources: [...concept.sources].sort(),
        notes: [concept.curated?.reason, override?.reason].filter((note): note is string => Boolean(note)),
      },
    });
  }

  // A name no source carries in Bulgarian gets one more look: a Bulgarian
  // Wikipedia page or redirect of exactly that name is a second source.
  await confirmBulgarianNames(drafts.map((draft) => draft.row), log);

  // Parents, for the loader, which creates a missing infraspecific node
  // under its species.
  const parentIds = drafts
    .map((draft) => draft.concept.taxon.parentTaxon)
    .filter((id): id is string => Boolean(id) && !entities.has(id!));
  for (const [id, entity] of await fetchEntities(parentIds)) entities.set(id, entity);
  for (const draft of drafts) {
    const parentId = draft.concept.taxon.parentTaxon;
    draft.row.parentLatin = parentId ? (entities.get(parentId)?.taxonName ?? null) : null;
  }

  const rows = drafts.map((draft) => draft.row);
  rows.sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) ||
      left.group.localeCompare(right.group) ||
      left.latin.localeCompare(right.latin) ||
      left.wikidata.localeCompare(right.wikidata),
  );
  const keys = new Set<string>();
  for (const row of rows) {
    if (keys.has(row.key)) row.key = `${row.key}-${row.wikidata.toLowerCase()}`;
    keys.add(row.key);
  }
  for (const lang of LANGS) {
    const seen = new Map<string, string>();
    for (const row of rows) {
      const key = nameKey(row.names[lang].display);
      const other = seen.get(key);
      if (other) log.push(`duplicate ${lang} display "${row.names[lang].display}": ${other} and ${row.key}`);
      else seen.set(key, row.key);
    }
  }

  const output = {
    version: STANDARD_BASE_VERSION,
    description:
      "The standard species base (OVE-530, ADR-0035 D3). Generated by apps/web/scripts/build-standard-species.ts; hand decisions in overrides.json.",
    sources: [
      { name: "State Register of Plant Varieties of Ukraine", url: REGISTER_URL, licence: "CC BY 4.0", snapshot: "2025-07-15" },
      { name: "Wikidata", url: "https://www.wikidata.org", licence: "CC0 1.0", snapshot: STANDARD_BASE_VERSION },
      { name: "Wikipedia (uk, bg, ru): article titles, redirects and category membership", url: "https://www.wikipedia.org", licence: "facts; no text copied", snapshot: STANDARD_BASE_VERSION },
      { name: "Wikipedia pageviews (PageViewInfo)", url: "https://www.mediawiki.org/wiki/Extension:PageViewInfo", licence: "CC0 1.0", window: PAGEVIEW_WINDOW },
      { name: "Curated candidates (the executor's knowledge; every name still checked against the sources above)", url: "data/standard-species/overrides.json", licence: "CC0 1.0" },
    ],
    thresholds: { pageviews: PAGEVIEW_THRESHOLDS, window: PAGEVIEW_WINDOW },
    counts: countBy(rows),
    rows,
  };
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(OUT_FILE, `${JSON.stringify(output, null, 1)}\n`);
  writeFileSync(path.join(DATA_DIR, "build-log.txt"), `${log.join("\n")}\n`);
  console.log(JSON.stringify(output.counts, null, 1));
}

/**
 * Bulgarian names that fewer than two sources carry: look the exact name up
 * in Bulgarian Wikipedia and record the page it leads to as evidence, and log
 * a row with no Bulgarian name at all so it is researched by hand.
 */
async function confirmBulgarianNames(rows: StandardSpeciesRow[], log: string[]) {
  const pending = rows.filter((row) => row.names.bg.status !== "confirmed");
  const titles = [...new Set(pending.map((row) => row.names.bg.display))];
  const resolved = new Map<string, string | null>();
  for (const batch of chunks(titles, 50)) {
    const params = new URLSearchParams({
      action: "query",
      redirects: "1",
      titles: batch.join("|"),
      format: "json",
      formatversion: "2",
    });
    const data = await cachedJson<{
      query?: {
        pages: Array<{ title: string; missing?: boolean }>;
        redirects?: Array<{ from: string; to: string }>;
        normalized?: Array<{ from: string; to: string }>;
      };
    }>(`https://bg.wikipedia.org/w/api.php?${params}`);
    const alias = new Map<string, string>();
    for (const step of [...(data?.query?.normalized ?? []), ...(data?.query?.redirects ?? [])]) {
      alias.set(step.from, step.to);
    }
    const existing = new Set(
      (data?.query?.pages ?? []).filter((page) => !page.missing).map((page) => page.title),
    );
    for (const title of batch) {
      let target = title;
      for (let hop = 0; hop < 3 && alias.has(target); hop += 1) target = alias.get(target)!;
      resolved.set(title, existing.has(target) ? target : null);
    }
  }
  for (const row of pending) {
    const target = resolved.get(row.names.bg.display);
    if (!target) {
      // A search of Bulgarian Wikipedia by the Latin name was tried and
      // returned genus and family articles ("Салвия" for two sages, a
      // category name for a fern), so a missing name is left to the hand
      // research in overrides.json rather than guessed.
      if (!/\p{Script=Cyrillic}/u.test(row.names.bg.display)) {
        log.push(`bg: no Bulgarian name for ${row.key} (${row.latin})`);
      }
      continue;
    }
    // Evidence only: a Bulgarian Wikipedia title and its redirects are one
    // source between them, so this never confirms a name on its own.
    const url = `https://bg.wikipedia.org/wiki/${encodeURIComponent(target.replaceAll(" ", "_"))}`;
    if (!row.names.bg.evidence.includes(url)) row.names.bg.evidence.push(url);
  }
}

function buildName(
  lang: Lang,
  concept: Concept,
  views: Map<string, number>,
  redirects: Map<string, string[]>,
  override: { display: string | undefined; search: string[]; evidence: string[] },
): StandardName {
  const articles = [...concept.articles];
  const titles = articles
    .map((article) => article.sitelinks[lang])
    .filter((title): title is string => Boolean(title))
    .sort(
      (left, right) =>
        (views.get(`${lang}:${right}`) ?? 0) - (views.get(`${lang}:${left}`) ?? 0) ||
        left.localeCompare(right),
    );
  const labels = articles
    .map((article) => article.labels[lang])
    .filter((label): label is string => Boolean(label));
  const aliases = articles.flatMap((article) => article.aliases[lang] ?? []);
  const redirectTitles = titles.flatMap((title) => redirects.get(`${lang}:${title}`) ?? []);
  const registerNames = lang === "uk" ? concept.register.map((crop) => crop.ukName) : [];

  // Every name a source gives, with where it came from.
  const sourced: Array<{ value: string; source: string }> = [
    ...titles.map((value) => ({ value, source: `${lang}wiki:title` })),
    ...redirectTitles.map((value) => ({ value, source: `${lang}wiki:redirect` })),
    ...labels.map((value) => ({ value, source: "wikidata:label" })),
    ...aliases.map((value) => ({ value, source: "wikidata:alias" })),
    ...registerNames.map((value) => ({ value, source: "ua_state_register" })),
  ].filter((candidate) => isCyrillicName(everydayForm(candidate.value, lang)));

  let display: string;
  let displaySource: string;
  if (override.display) {
    display = override.display;
    displaySource = "overrides";
  } else {
    const title = titles.map((value) => everydayForm(value, lang)).find((value) => isCyrillicName(value));
    const head = title ? everydayHead(title, sourced, lang) : null;
    if (head) {
      display = head;
      displaySource = "sources:head-word";
    } else if (title) {
      display = title;
      displaySource = `${lang}wiki:title`;
    } else if (sourced[0]) {
      display = everydayForm(sourced[0].value, lang);
      displaySource = sourced[0].source;
    } else {
      display = concept.taxon.taxonName!;
      displaySource = "wikidata:P225";
    }
  }

  const supporting = new Set<string>();
  for (const candidate of sourced) {
    if (nameKey(everydayForm(candidate.value, lang)) === nameKey(display)) {
      supporting.add(candidate.source.replace(/:redirect$/u, ":title"));
    }
  }
  // A page researched by hand that names the organism so (a seed or nursery
  // catalogue, a register) is a source of its own, one per independent site.
  for (const url of override.evidence) supporting.add(`web:${new URL(url).hostname}`);
  const cyrillic = /\p{Script=Cyrillic}/u.test(display);
  const status: StandardName["status"] =
    cyrillic && supporting.size >= 2 ? "confirmed" : lang === "bg" ? "single_source" : "review";
  const evidence = [
    ...titles.map(
      (title) => `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`,
    ),
    ...override.evidence,
  ];
  if (!evidence.length) evidence.push(`https://www.wikidata.org/wiki/${concept.taxon.id}`);

  const search = new Map<string, string>();
  for (const value of [...sourced.map((candidate) => candidate.value), ...override.search]) {
    const form = everydayForm(value, lang);
    if (!isCyrillicName(form)) continue;
    const key = nameKey(form);
    if (key === nameKey(display) || search.has(key)) continue;
    search.set(key, form);
  }
  return {
    display,
    displaySource,
    search: [...search.values()].sort((a, b) => a.localeCompare(b, lang)),
    status,
    evidence,
  };
}

/**
 * "Огірок звичайний" → "Огірок" when the sources themselves use the head
 * word for this organism (a redirect to its article, or its label). A head
 * word no source ties to this organism — "Смородина" for black currant — stays
 * the full title.
 */
function everydayHead(
  title: string,
  sourced: Array<{ value: string; source: string }>,
  lang: Lang,
): string | null {
  const words = title.split(" ");
  if (words.length < 2) return null;
  const head = words[0]!;
  const tied = sourced.some(
    (candidate) =>
      candidate.source !== "ua_state_register" &&
      nameKey(everydayForm(candidate.value, lang)) === nameKey(head),
  );
  return tied ? head : null;
}

function mostCommon<T extends string>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
}

function slugOf(latin: string): string {
  return latin
    .toLowerCase()
    .replace(/×/gu, "x")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function countBy(rows: StandardSpeciesRow[]) {
  const byGroup: Record<string, number> = {};
  const status: Record<string, Record<string, number>> = { uk: {}, bg: {}, ru: {} };
  for (const row of rows) {
    byGroup[`${row.kind}/${row.group}`] = (byGroup[`${row.kind}/${row.group}`] ?? 0) + 1;
    for (const lang of LANGS) {
      const state = row.names[lang].status;
      status[lang]![state] = (status[lang]![state] ?? 0) + 1;
    }
  }
  return {
    rows: rows.length,
    plants: rows.filter((row) => row.kind === "plant").length,
    animals: rows.filter((row) => row.kind === "animal").length,
    byGroup,
    status,
  };
}

if (process.argv[1]?.includes("build-standard-species")) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
