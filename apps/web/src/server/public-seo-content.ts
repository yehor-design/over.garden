import "server-only";

import {
  MARKET_LANDING_LOCALES,
  type MarketLandingMarket,
} from "@/lib/market-landing-locales";

import type { MetadataRoute } from "next";

import type { PlantObjectKind } from "@/db/schema";
import { publicTopicPath } from "@/lib/garden/public-paths";
import { stripKnowledgeCitations } from "@/lib/knowledge-citations";
import {
  localizedPath,
  PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";
import {
  AUTHORED_PUBLIC_SURFACE_LASTMOD,
  type PublicSurfaceKind,
} from "@/server/public-surface-indexing-policy";
import {
  resolvePublicSurfaceDiscoveryForRequest,
  type PublicSurfaceDiscoveryConsumerId,
  type PublicSurfaceDiscoveryResult,
} from "@/server/public-surface-discovery";

type AuthoredPublicContentKind = Extract<
  PublicSurfaceKind,
  | "marketing_landing"
  | "knowledge_hub"
  | "editorial_blog"
  | "guide"
  | "aeo_answer"
>;

type SitemapFrequency = NonNullable<
  MetadataRoute.Sitemap[number]["changeFrequency"]
>;

export interface PublicContentLink {
  label: string;
  href: string;
  description: string;
}

export interface PublicContentSection {
  heading: string;
  body: string;
}

export interface BlogPostContent {
  kind: "editorial_blog";
  slug: string;
  path: string;
  title: string;
  description: string;
  excerpt: string;
  publishedDate: string;
  sections: PublicContentSection[];
  relatedLinks: PublicContentLink[];
}

export interface GuideStep {
  title: string;
  body: string;
}

export interface PublicKnowledgeEvidenceRule {
  topicSlugs: readonly string[];
  catalogSlugs: readonly string[];
}

/**
 * What a piece of knowledge is about (`OVE-498`, OG-UX-033).
 *
 * Gardening advice and help with OverGarden are two different promises, and a
 * reader has to be able to tell them apart before reading either: the first
 * owes its sources, the second only has to be true of the product.
 */
export type PublicKnowledgeSubject = "gardening" | "product";

/**
 * Another piece a reader may want next: an answer or a guide by its slug, or
 * a curated topic, which is shown only while the topic exists and holds
 * entries.
 */
export type PublicKnowledgeRelated =
  | { kind: "answer" | "guide"; slug: string }
  | { kind: "topic"; slug: string };

export interface PublicKnowledgeFacet {
  task: string;
  subject: PublicKnowledgeSubject;
  objectKinds: readonly PlantObjectKind[];
  /** Which gardeners' entries sit beside the text. */
  evidence: PublicKnowledgeEvidenceRule;
  /** The page's one related-content section, in order. */
  related: readonly PublicKnowledgeRelated[];
}

/**
 * A work the text rests on, cited as `[n]` in the text by its position.
 *
 * Everything here is what the editors read, on the day they read it; a date
 * the source itself shows is kept with the word it shows it under.
 */
export interface PublicKnowledgeSource {
  title: string;
  publisher: string;
  url: string;
  /** The language the source is written in, for `lang`. */
  language: string;
  sourceDate?: { date: string; kind: "published" | "updated" };
  accessedDate: string;
}

/**
 * Whether a specialist read the text. Nobody has yet, and the page says so;
 * the reviewed shape is here so that saying otherwise needs a name and a date.
 */
export type PublicKnowledgeReview =
  | { state: "not_reviewed" }
  | { state: "reviewed"; reviewer: string; reviewedDate: string };

export interface PublicKnowledgeEditorialMeta {
  author: string;
  /** What the text rests on, in one plain sentence. */
  basis: string;
  sources: readonly PublicKnowledgeSource[];
  /** What the text is not, and where it stops applying. */
  qualifications: readonly string[];
  review: PublicKnowledgeReview;
  updatedDate: string;
  authoredLocale: PublicLocale;
  synthetic: boolean;
}

export interface PublicKnowledgeMedia {
  publicUrl: string;
  alt: string;
}

export interface GuideContent {
  kind: "guide";
  slug: string;
  path: string;
  title: string;
  description: string;
  outcome: string;
  steps: GuideStep[];
  /** The heading over the gardeners' entries beside it, saying what about. */
  evidenceTitle: string;
  editorial: PublicKnowledgeEditorialMeta;
  knowledge: PublicKnowledgeFacet;
  media?: PublicKnowledgeMedia;
}

export interface AnswerFaq {
  question: string;
  answer: string;
}

/**
 * How to do what the answer suggests in OverGarden: help with the product,
 * kept out of the gardening text and out of its FAQ, and pointing at the
 * guide that says the rest.
 */
export interface AnswerProductHelp {
  title: string;
  paragraphs: readonly string[];
  guideSlug: string;
}

export interface AnswerPageContent {
  kind: "aeo_answer";
  slug: string;
  path: string;
  question: string;
  title: string;
  description: string;
  /** Self-contained, and cited: the part an answer engine lifts. */
  conciseAnswer: string;
  /** A pattern a reader can see, and what it usually means; each cited. */
  causes: string[];
  /** What to note so the cause can be told, which asserts nothing. */
  observations: string[];
  /** Gardening questions only; they are the page's `FAQPage`. */
  faqs: AnswerFaq[];
  productHelp: AnswerProductHelp;
  /** The heading over the gardeners' entries beside it, saying what about. */
  evidenceTitle: string;
  editorial: PublicKnowledgeEditorialMeta;
  knowledge: PublicKnowledgeFacet;
  media?: PublicKnowledgeMedia;
}

export interface MarketLandingContent {
  kind: "marketing_landing";
  market: MarketLandingMarket;
  path: string;
  title: string;
  description: string;
  localAudience: string;
  promise: string;
  proofPlan: string[];
  localizationHandoff: {
    locale: "uk" | "bg";
    plannedPath: string;
    owningIssue: "OVE-117";
  };
  relatedLinks: PublicContentLink[];
}

export interface AuthoredPublicContentSitemapEntry {
  kind: AuthoredPublicContentKind;
  locale: PublicLocale;
  path: string;
  lastModified: string;
  changeFrequency: SitemapFrequency;
  priority: number;
}

interface AuthoredPublicContentSitemapTemplate {
  kind: AuthoredPublicContentKind;
  path: string;
  lastModified: string;
  changeFrequency: SitemapFrequency;
  priority: number;
  locales: readonly PublicLocale[];
}

type AuthoredPublicSurfaceConsumerId = Extract<
  PublicSurfaceDiscoveryConsumerId,
  | "localized_blog_index"
  | "localized_blog_post"
  | "localized_guide"
  | "localized_answer"
  | "localized_knowledge_hub"
  | "localized_market"
  | "authored_sitemap"
>;

export interface AuthoredPublicSurfaceSourceInput {
  consumerId: AuthoredPublicSurfaceConsumerId;
  canonicalPath: string;
  equivalentLocales: readonly PublicLocale[];
  visibleText: readonly string[];
  distinctPublicEntityIds: readonly string[];
  meaningfulContentAt: string;
  candidateState?: "candidate" | "not_public_candidate";
  evaluatedAt?: string | Date;
}

export const BLOG_INDEX_PATH = "/blog";
export const KNOWLEDGE_HUB_PATH = "/knowledge";

export { MARKET_LANDING_LOCALES } from "@/lib/market-landing-locales";

const BLOG_POSTS: BlogPostContent[] = [
  {
    kind: "editorial_blog",
    slug: "ai-garden-advice-vs-real-garden-proof",
    path: "/blog/ai-garden-advice-vs-real-garden-proof",
    title: "AI garden advice is not the same as dated garden proof",
    description:
      "Why OverGarden starts with living plant records before public recommendations.",
    excerpt:
      "A general answer can be useful, but a dated record of what happened to a real plant is the proof layer gardeners can compare season after season.",
    publishedDate: "2026-07-03",
    sections: [
      {
        heading: "Advice disappears. Records compound.",
        body: "A chat answer can explain what should work. A dated plant record shows what changed, when it changed, and whether the gardener came back after the first fix. That published history becomes the useful evidence gardeners can compare over time.",
      },
      {
        heading: "Public pages must earn trust before they earn traffic.",
        body: "OverGarden will not index empty catalog stubs, transient composer text, or account-only data as search bait. Published journal entries are public and eligible for search-engine indexing.",
      },
      {
        heading: "The first publication is intentional.",
        body: "The path is simple: choose one living object, compose one observation in the current tab, review exactly what will be public, and publish it in one atomic action. Canceling creates no durable record; a successful Publish creates the dated public history.",
      },
    ],
    relatedLinks: [
      {
        label: "Start a plant record",
        href: "/garden",
        description:
          "Open the gated workspace and save the first dated observation.",
      },
      {
        label: "Read the starter guide",
        href: "/guides/start-a-living-plant-record",
        description:
          "A minimal process for recording one plant without turning the garden into a spreadsheet.",
      },
    ],
  },
];

const GUIDES: GuideContent[] = [
  {
    kind: "guide",
    slug: "start-a-living-plant-record",
    path: "/guides/start-a-living-plant-record",
    title: "How to start a living plant record",
    description:
      "A practical first OverGarden workflow for one plant, one dated note, and one return visit.",
    outcome:
      "By the end, the gardener has one saved plant object and a first observation that can be compared later.",
    steps: [
      {
        title: "Pick one plant, not the whole garden",
        body: "Start with the plant that is easiest to recognize again: a balcony tomato, a cucumber bed, a basil pot, or a young tree. One object is enough for the first record.",
      },
      {
        title: "Write what changed today",
        body: "Use ordinary words: sprouted, moved outside, first flower, yellow lower leaves, first harvest. The date and the plant identity matter more than polished writing.",
      },
      {
        title: "Add a photo only when it helps future comparison",
        body: "A photo is useful when it shows a visible stage or problem. Your browser prepares the photo before upload; OverGarden does not retain the source original. Review the image for details you do not want to make public.",
      },
      {
        title: "Return to the same object",
        body: "The second note turns the notes into a history. It shows whether the plant recovered, worsened, flowered, fruited, or simply survived the season.",
      },
    ],
    evidenceTitle: "Other gardeners' records of plants",
    editorial: {
      author: "OverGarden editorial",
      basis:
        "How OverGarden works on the date below: publishing, photographs and what is kept.",
      sources: [],
      qualifications: ["This is help with OverGarden, not gardening advice."],
      review: { state: "not_reviewed" },
      updatedDate: "2026-09-23",
      authoredLocale: "uk",
      synthetic: false,
    },
    knowledge: {
      task: "start-and-continue-a-living-record",
      subject: "product",
      objectKinds: ["plant"],
      // Other gardeners' plant records, as examples of what one looks like.
      evidence: {
        topicSlugs: ["plants"],
        catalogSlugs: [],
      },
      related: [{ kind: "answer", slug: "why-are-tomato-leaves-yellow" }],
    },
  },
];

/**
 * The works the tomato answer rests on, read on 2026-09-23. Which sentence
 * rests on which is `docs/redesign/2026-09-21/OVE-498-PROVENANCE.md`.
 */
const TOMATO_LEAF_SOURCES: readonly PublicKnowledgeSource[] = [
  {
    title: "Key to Common Problems of Tomatoes",
    publisher: "University of Maryland Extension",
    url: "https://extension.umd.edu/resource/key-common-problems-tomatoes",
    language: "en",
    sourceDate: { date: "2025-06-18", kind: "updated" },
    accessedDate: "2026-09-23",
  },
  {
    title: "Troubleshooting Tomato Problems",
    publisher: "University of Wisconsin–Madison Division of Extension",
    url: "https://hort.extension.wisc.edu/troubleshooting-tomato-problems/",
    language: "en",
    sourceDate: { date: "2025-07-28", kind: "published" },
    accessedDate: "2026-09-23",
  },
  {
    title: "Tomatoes: leaf problems",
    publisher: "Royal Horticultural Society",
    url: "https://www.rhs.org.uk/problems/tomatoes-leaf-problems",
    language: "en",
    accessedDate: "2026-09-23",
  },
  {
    title:
      "Vegetable Seedlings or Transplant Leaves Yellowing, Turning White, or are Spotted or Scorched",
    publisher: "University of Maryland Extension",
    url: "https://extension.umd.edu/resource/vegetable-seedlings-or-transplant-leaves-yellowing-turning-white-or-are-spotted-or-scorched",
    language: "en",
    sourceDate: { date: "2023-02-20", kind: "updated" },
    accessedDate: "2026-09-23",
  },
];

const ANSWER_PAGES: AnswerPageContent[] = [
  {
    kind: "aeo_answer",
    slug: "why-are-tomato-leaves-yellow",
    path: "/answers/why-are-tomato-leaves-yellow",
    question: "Why are tomato leaves turning yellow?",
    title: "Why are tomato leaves turning yellow?",
    description:
      "The common causes of yellow tomato leaves, from university extension services and the RHS, and what to note to find yours.",
    conciseAnswer:
      "Several things turn tomato leaves yellow: fungal leaf spots on the lower leaves, a shortage of nitrogen or magnesium, a wilt disease, spider mites and, in young plants, cold, compacted, waterlogged or dry soil[1][2][3][4]. The pattern tells them apart: where the yellowing started, whether there are spots or specks, and whether the plant wilts.",
    causes: [
      "Dark spots on the lower leaves first, then the leaves turn yellow or brown: often a fungal leaf spot, early blight or septoria leaf spot, which spreads in wet weather[1][2].",
      "The older, lower leaves yellow first, then the younger ones: a shortage of nitrogen. It is especially common in containers, because of frequent watering and poor soil[1][2].",
      "Yellow between the veins of the older leaves: most often a shortage of magnesium[1][3]. If only the older leaves show it, the RHS considers it no cause for concern[3].",
      "The lower leaves yellow and the stems wilt, often on one side of the plant: possibly Fusarium or Verticillium wilt, diseases carried in the soil[1].",
      "Tiny yellow specks, with the undersides of the leaves looking dirty: spider mites, common in hot, dry weather[1].",
      "Young plants and fresh transplants also yellow from their conditions: cold, compacted or waterlogged soil, drought and swings of temperature[4].",
    ],
    observations: [
      "Where the yellowing started: the lower leaves, the new growth or the whole plant.",
      "What the leaves look like: evenly yellow, yellow between the veins, spots with rings, or fine specks.",
      "How you watered, whether water drains from the container, and whether the plant was recently transplanted or moved outside or into stronger sun.",
      "One dated photo, then the same plant again after the next watering.",
    ],
    faqs: [
      {
        question: "What detail matters most for yellowing leaves?",
        answer:
          "The pattern over time: where the yellowing started, what changed before it appeared, and whether the plant improved after the next thing you did.",
      },
      {
        question: "When are yellow leaves no cause for concern?",
        answer:
          "When only the older leaves are yellow between the veins and the plant is otherwise vigorous, the RHS considers it no cause for concern[3]. Spots, specks, wilting, or yellowing that climbs to the young leaves are worth a closer look[1].",
      },
    ],
    productHelp: {
      title: "Recording this in OverGarden",
      paragraphs: [
        "OverGarden does not diagnose plants. It keeps your dated entries about the same plant, so the next one can be compared with the first.",
        "A photo is optional. Your browser prepares it before upload and OverGarden does not keep the original; check the frame for addresses, faces or anything else you do not want public. An entry is public as soon as you publish it, and until then its text exists only in that tab.",
      ],
      guideSlug: "start-a-living-plant-record",
    },
    evidenceTitle: "What gardeners wrote about tomatoes",
    editorial: {
      author: "OverGarden editorial",
      basis:
        "A summary of the tomato guides of two university extension services and the Royal Horticultural Society, listed below. What to note is the editors' own list.",
      sources: TOMATO_LEAF_SOURCES,
      qualifications: [
        "It is not a diagnosis: yellow leaves have several causes, and a description or a photograph can only narrow them down.",
        "The sources describe gardens in the United States and the United Kingdom; which diseases are common, and when, differs from region to region.",
      ],
      review: { state: "not_reviewed" },
      updatedDate: "2026-09-23",
      authoredLocale: "uk",
      synthetic: false,
    },
    knowledge: {
      task: "observe-yellowing-before-changing-care",
      subject: "gardening",
      objectKinds: ["plant"],
      // What gardeners here wrote about tomatoes. The topics this pointed at
      // before (`watering-and-moisture`, `stress-and-recovery`) never
      // existed, so the page counted nothing and said so.
      evidence: {
        topicSlugs: [],
        catalogSlugs: ["solanum-lycopersicum"],
      },
      related: [{ kind: "topic", slug: "plants" }],
    },
  },
];

const MARKET_LANDINGS: MarketLandingContent[] = [
  {
    kind: "marketing_landing",
    market: "ukraine",
    path: "/markets/ukraine",
    title: "OverGarden for gardeners in Ukraine",
    description:
      "A public landing page for Ukrainian gardeners who need a public plant journal and dated observations.",
    localAudience:
      "Gardeners growing on balconies, dachas, village plots, greenhouses, and small household spaces in Ukraine.",
    promise:
      "Publish dated observations about your plants without adding a precise location. Every published entry is public.",
    proofPlan: [
      "The first public entry and follow-up observations build the history of the same object.",
      "Public pages use authored guidance now and real public entries only after explicit publication.",
      "Location stays hidden or coarse-region only; precise coordinates stay out of product surfaces.",
    ],
    localizationHandoff: {
      locale: "uk",
      plannedPath: "/markets/ukraine",
      owningIssue: "OVE-117",
    },
    relatedLinks: [
      {
        label: "Create a public entry",
        href: "/garden",
        description:
          "Publish your first observation. Unpublished writing exists only in the current tab; there are no saved drafts.",
      },
      {
        label: "Read the first-record guide",
        href: "/guides/start-a-living-plant-record",
        description:
          "Use one plant and one dated observation as the first OverGarden action.",
      },
    ],
  },
  {
    kind: "marketing_landing",
    market: "bulgaria",
    path: "/markets/bulgaria",
    title: "OverGarden for gardeners in Bulgaria",
    description:
      "A public landing page for Bulgarian gardeners who need a public plant journal and dated observations.",
    localAudience:
      "Gardeners growing in gardens, yards, greenhouses, terraces, villas, and small household spaces in Bulgaria.",
    promise:
      "Publish dated observations about your plants without adding a precise location. Every published entry is public.",
    proofPlan: [
      "The first public entry and follow-up observations build the history of the same object.",
      "Market content starts authored and sparse until real public records make aggregation useful.",
      "Language-specific copy and hreflang are reserved for the localization foundation.",
    ],
    localizationHandoff: {
      locale: "bg",
      plannedPath: "/bg/markets/bulgaria",
      owningIssue: "OVE-117",
    },
    relatedLinks: [
      {
        label: "Create a public entry",
        href: "/garden",
        description:
          "Publish your first observation. Unpublished writing exists only in the current tab; there are no saved drafts.",
      },
      {
        label: "Read the first-record guide",
        href: "/guides/start-a-living-plant-record",
        description:
          "Use one plant and one dated observation as the first OverGarden action.",
      },
    ],
  },
];

export function listBlogPosts() {
  return BLOG_POSTS;
}

export function getBlogPost(slug: string) {
  return BLOG_POSTS.find((post) => post.slug === slug) ?? null;
}

export function listGuides() {
  return GUIDES;
}

export function getGuide(slug: string) {
  return GUIDES.find((guide) => guide.slug === slug) ?? null;
}

export function listAnswerPages() {
  return ANSWER_PAGES;
}

export function getAnswerPage(slug: string) {
  return ANSWER_PAGES.find((page) => page.slug === slug) ?? null;
}

export function listMarketLandings() {
  return MARKET_LANDINGS;
}

export function getMarketLanding(market: string) {
  return MARKET_LANDINGS.find((landing) => landing.market === market) ?? null;
}

export function listAvailableMarketLandingLocales(
  market: MarketLandingContent["market"],
) {
  return MARKET_LANDING_LOCALES[market];
}

export function isMarketLandingAvailableInLocale(
  landing: MarketLandingContent,
  locale: PublicLocale,
) {
  return MARKET_LANDING_LOCALES[landing.market].includes(locale);
}

export function resolveAuthoredPublicSurfaceDiscovery(
  input: AuthoredPublicSurfaceSourceInput,
): PublicSurfaceDiscoveryResult {
  return resolvePublicSurfaceDiscoveryForRequest({
    consumerId: input.consumerId,
    candidateState: input.candidateState ?? "candidate",
    visibleText: input.visibleText,
    distinctPublicEntityIds: input.distinctPublicEntityIds,
    canonicalPath: input.canonicalPath,
    equivalentLocales: input.equivalentLocales,
  });
}

export function authoredContentEntityIds(
  path: string,
  relatedPaths: readonly string[] = [],
) {
  return [
    `authored:${path}`,
    ...relatedPaths.map((relatedPath) => `public:${relatedPath}`),
  ];
}

/**
 * The public surface a catalog evidence slug resolves to: the journal
 * directory filtered by that identity. The Stable Catalog explorer that once
 * answered `/catalog/<slug>` is retired (ADR-0025).
 */
export function catalogEvidencePublicPath(slug: string) {
  return `/journals?catalog=${encodeURIComponent(slug)}`;
}

export function blogPostVisibleText(post: BlogPostContent) {
  return [
    post.title,
    post.description,
    post.excerpt,
    ...post.sections.flatMap((section) => [section.heading, section.body]),
    ...post.relatedLinks.flatMap((link) => [link.label, link.description]),
  ];
}

/** What the editors put their name to, as a reader sees it. */
function editorialVisibleText(editorial: PublicKnowledgeEditorialMeta) {
  return [
    editorial.author,
    editorial.basis,
    ...editorial.qualifications,
    ...editorial.sources.flatMap((source) => [source.title, source.publisher]),
  ];
}

export function guideVisibleText(guide: GuideContent) {
  return [
    guide.title,
    guide.description,
    guide.outcome,
    ...guide.steps.flatMap((step) => [step.title, step.body]),
    ...editorialVisibleText(guide.editorial),
  ];
}

export function answerVisibleText(page: AnswerPageContent) {
  return [
    page.question,
    page.title,
    page.description,
    stripKnowledgeCitations(page.conciseAnswer),
    ...page.causes.map(stripKnowledgeCitations),
    ...page.observations,
    ...page.faqs.flatMap((faq) => [
      faq.question,
      stripKnowledgeCitations(faq.answer),
    ]),
    page.productHelp.title,
    ...page.productHelp.paragraphs,
    ...editorialVisibleText(page.editorial),
  ];
}

/**
 * Everything on the page a reader can search the hub for: the words of the
 * piece itself, not its title alone (`OVE-498`, criterion 1).
 */
export function knowledgeSearchText(content: GuideContent | AnswerPageContent) {
  return (
    content.kind === "guide"
      ? guideVisibleText(content)
      : answerVisibleText(content)
  ).join(" ");
}

/**
 * The addresses a piece names: what its related section and its evidence
 * point at. Discovery counts them as the page's distinct public entities.
 */
export function knowledgeRelatedPaths(
  content: GuideContent | AnswerPageContent,
) {
  return [
    ...content.knowledge.related.map((related) =>
      related.kind === "topic"
        ? publicTopicPath(related.slug)
        : `/${related.kind === "answer" ? "answers" : "guides"}/${related.slug}`,
    ),
    ...(content.kind === "aeo_answer"
      ? [`/guides/${content.productHelp.guideSlug}`]
      : []),
    ...content.knowledge.evidence.topicSlugs.map(publicTopicPath),
    ...content.knowledge.evidence.catalogSlugs.map(catalogEvidencePublicPath),
  ];
}

export function marketLandingVisibleText(landing: MarketLandingContent) {
  return [
    landing.title,
    landing.description,
    landing.localAudience,
    landing.promise,
    ...landing.proofPlan,
    ...landing.relatedLinks.flatMap((link) => [link.label, link.description]),
  ];
}

export function listAuthoredPublicContentSitemapCandidates(): AuthoredPublicContentSitemapEntry[] {
  const entries: AuthoredPublicContentSitemapTemplate[] = [
    {
      kind: "knowledge_hub",
      path: KNOWLEDGE_HUB_PATH,
      lastModified: AUTHORED_PUBLIC_SURFACE_LASTMOD,
      changeFrequency: "weekly",
      priority: 0.75,
      locales: PUBLIC_LOCALES,
    },
    {
      kind: "editorial_blog",
      path: BLOG_INDEX_PATH,
      lastModified: AUTHORED_PUBLIC_SURFACE_LASTMOD,
      changeFrequency: "weekly",
      priority: 0.7,
      locales: PUBLIC_LOCALES,
    },
    ...BLOG_POSTS.map((post) => ({
      kind: post.kind,
      path: post.path,
      lastModified: dateOnlyToUtcLastModified(post.publishedDate),
      changeFrequency: "monthly" as const,
      priority: 0.65,
      locales: PUBLIC_LOCALES,
    })),
    ...GUIDES.map((guide) => ({
      kind: guide.kind,
      path: guide.path,
      lastModified: AUTHORED_PUBLIC_SURFACE_LASTMOD,
      changeFrequency: "monthly" as const,
      priority: 0.65,
      locales: PUBLIC_LOCALES,
    })),
    ...ANSWER_PAGES.map((page) => ({
      kind: page.kind,
      path: page.path,
      lastModified: AUTHORED_PUBLIC_SURFACE_LASTMOD,
      changeFrequency: "monthly" as const,
      priority: 0.6,
      locales: PUBLIC_LOCALES,
    })),
    ...MARKET_LANDINGS.map((landing) => ({
      kind: landing.kind,
      path: landing.path,
      lastModified: AUTHORED_PUBLIC_SURFACE_LASTMOD,
      changeFrequency: "monthly" as const,
      priority: 0.65,
      locales: MARKET_LANDING_LOCALES[landing.market],
    })),
  ];

  return entries.flatMap((entry) => {
    return entry.locales.map(
      (locale): AuthoredPublicContentSitemapEntry => ({
        kind: entry.kind,
        locale,
        path: localizedPath(locale, entry.path),
        lastModified: entry.lastModified,
        changeFrequency: entry.changeFrequency,
        priority: entry.priority,
      }),
    );
  });
}

function dateOnlyToUtcLastModified(date: string) {
  return `${date}T00:00:00.000Z`;
}
