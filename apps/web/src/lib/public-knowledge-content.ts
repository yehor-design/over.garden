import type { PlantObjectKind } from "@/db/schema";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import { normalizePublicObjectKindFilter } from "@/lib/garden/catalog-object-kind";

const MAX_PUBLIC_KNOWLEDGE_QUERY_LENGTH = 112;
const UNSAFE_PUBLIC_KNOWLEDGE_QUERY =
  /(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:\+?\d[\d\s().-]{7,}\d)|https?:\/\/|www\.|\b(?:latitude|longitude|gps|coordinates?|координат|широта|довгота)\b|[-+]?\d{1,3}\.\d{3,}\s*[,;/]\s*[-+]?\d{1,3}\.\d{3,})/i;

export type PublicKnowledgeContentType = "all" | "guide" | "answer" | "topic";
export type PublicKnowledgeObjectKind = "all" | PlantObjectKind;

export interface PublicKnowledgeRequest {
  query: string;
  type: PublicKnowledgeContentType;
  kind: PublicKnowledgeObjectKind;
}

export interface PublicKnowledgeListItem {
  kind: Exclude<PublicKnowledgeContentType, "all">;
  path: string;
  title: string;
  description: string;
  objectKinds: readonly PlantObjectKind[];
}

type SearchParams = Record<string, string | string[] | undefined>;

export function normalizePublicKnowledgeRequest(
  input: SearchParams,
): PublicKnowledgeRequest {
  const rawQuery = firstValue(input.q)?.trim().replace(/\s+/g, " ") ?? "";
  const query = UNSAFE_PUBLIC_KNOWLEDGE_QUERY.test(rawQuery)
    ? ""
    : rawQuery.slice(0, MAX_PUBLIC_KNOWLEDGE_QUERY_LENGTH).trim();
  const type = normalizeLower(firstValue(input.type));
  const kind = normalizeLower(firstValue(input.kind));

  return {
    query,
    type: isContentType(type) ? type : "all",
    kind:
      kind === "all"
        ? "all"
        : (normalizePublicObjectKindFilter(kind) ?? "all"),
  };
}

export function buildPublicKnowledgeHref(
  locale: PublicLocale,
  request: PublicKnowledgeRequest,
  visualCorpus = false,
) {
  const params = new URLSearchParams();
  if (request.query) params.set("q", request.query);
  if (request.type !== "all") params.set("type", request.type);
  if (request.kind !== "all") params.set("kind", request.kind);
  if (visualCorpus) params.set("__visualKnowledge", "corpus");

  const query = params.toString();
  const path = localizedPath(locale, "/knowledge");
  return query ? `${path}?${query}` : path;
}

export function filterPublicKnowledgeItems<T extends PublicKnowledgeListItem>(
  items: readonly T[],
  request: PublicKnowledgeRequest,
): T[] {
  const query = request.query.toLocaleLowerCase("uk");

  return items.filter((item) => {
    if (request.type !== "all" && item.kind !== request.type) return false;
    if (request.kind !== "all" && !item.objectKinds.includes(request.kind)) {
      return false;
    }
    if (!query) return true;

    return `${item.title} ${item.description}`
      .toLocaleLowerCase("uk")
      .includes(query);
  });
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeLower(value: string | undefined) {
  return value?.trim().toLocaleLowerCase("en") ?? "";
}

function isContentType(value: string): value is PublicKnowledgeContentType {
  return ["all", "guide", "answer", "topic"].includes(value);
}