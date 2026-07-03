import "server-only";

import type { MetadataRoute } from "next";

import { absolutePublicUrl } from "@/lib/garden/public-url";
import {
  evaluatePublicSurfaceIndexability,
  type PublicSurfaceKind,
} from "@/server/public-surface-indexing-policy";

type AuthoredPublicContentKind = Extract<
  PublicSurfaceKind,
  "marketing_landing" | "editorial_blog" | "guide" | "aeo_answer"
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

export interface GuideContent {
  kind: "guide";
  slug: string;
  path: string;
  title: string;
  description: string;
  outcome: string;
  steps: GuideStep[];
  relatedLinks: PublicContentLink[];
}

export interface AnswerFaq {
  question: string;
  answer: string;
}

export interface AnswerPageContent {
  kind: "aeo_answer";
  slug: string;
  path: string;
  question: string;
  title: string;
  description: string;
  conciseAnswer: string;
  proofDetails: string[];
  relatedVarieties: PublicContentLink[];
  relatedTopics: PublicContentLink[];
  faqs: AnswerFaq[];
}

export interface MarketLandingContent {
  kind: "marketing_landing";
  market: "ukraine" | "bulgaria";
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
  path: string;
  changeFrequency: SitemapFrequency;
  priority: number;
}

export const BLOG_INDEX_PATH = "/blog";

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
        body: "A chat answer can explain what should work. A dated plant record shows what changed, when it changed, and whether the gardener came back after the first fix. That history is the useful part OverGarden protects before anything becomes public.",
      },
      {
        heading: "Public pages must earn trust before they earn traffic.",
        body: "OverGarden will not index empty catalog stubs or private journals as search bait. Public discovery starts with authored pages, then expands only when real public entries and safe aggregation thresholds make a page useful on its own.",
      },
      {
        heading: "The first product action is private.",
        body: "The safest path for a gardener is simple: choose one living object, save one observation, and return to the same object when something changes. Publication is a later explicit choice, not the default cost of keeping a record.",
      },
    ],
    relatedLinks: [
      {
        label: "Start a private plant record",
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
        body: "A photo is useful when it shows a visible stage or problem. OverGarden keeps public media derivative-only and strips photo metadata before any public display.",
      },
      {
        title: "Return to the same object",
        body: "The second note is where the record starts becoming proof. It shows whether the plant recovered, worsened, flowered, fruited, or simply survived the season.",
      },
    ],
    relatedLinks: [
      {
        label: "Open the workspace",
        href: "/garden",
        description: "Create the first private record behind the auth gate.",
      },
      {
        label: "Why proof beats generic advice",
        href: "/blog/ai-garden-advice-vs-real-garden-proof",
        description:
          "The positioning behind OverGarden's public discovery surface.",
      },
    ],
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
      "A concise diagnostic answer and a proof-first record plan for yellowing tomato leaves.",
    conciseAnswer:
      "Tomato leaves often turn yellow from water stress, poor drainage, old lower leaves, nutrient imbalance, or root stress. The fastest useful move is to record where the yellowing starts, whether the soil is staying wet or dry, and what changes over the next few days.",
    proofDetails: [
      "Note whether the yellowing starts on lower leaves, new growth, or the whole plant.",
      "Record watering, container drainage, and whether the plant recently moved outside or into stronger sun.",
      "Add one dated photo for comparison, then return to the same plant after the next watering cycle.",
      "Keep the public version region-level or hidden; never publish precise coordinates.",
    ],
    relatedVarieties: [
      {
        label: "Tomatoes",
        href: "/garden",
        description:
          "Start a dated record for the tomato plant you are actually growing.",
      },
      {
        label: "Balcony vegetables",
        href: "/markets/ukraine",
        description:
          "See how OverGarden frames first records for gardeners in Ukraine.",
      },
    ],
    relatedTopics: [
      {
        label: "First plant record",
        href: "/guides/start-a-living-plant-record",
        description:
          "The minimum record structure needed before a diagnosis becomes comparable.",
      },
      {
        label: "Proof instead of one-off advice",
        href: "/blog/ai-garden-advice-vs-real-garden-proof",
        description:
          "Why OverGarden treats dated follow-up as the useful public layer.",
      },
    ],
    faqs: [
      {
        question: "Should I publish a problem photo immediately?",
        answer:
          "No. Save the private record first. Publish later only if you choose, after the photo has a stripped public derivative and the note contains no private location or identity details.",
      },
      {
        question: "What detail matters most for yellowing leaves?",
        answer:
          "The pattern over time matters most: where yellowing started, what changed before it appeared, and whether the plant improved after the next action.",
      },
      {
        question: "Can OverGarden diagnose the plant by itself?",
        answer:
          "The MVP does not promise automatic diagnosis. It creates a clean record so the gardener can compare the same plant across days and later contribute useful public proof.",
      },
    ],
  },
];

const MARKET_LANDINGS: MarketLandingContent[] = [
  {
    kind: "marketing_landing",
    market: "ukraine",
    path: "/markets/ukraine",
    title: "OverGarden for gardeners in Ukraine",
    description:
      "A public landing page for Ukrainian gardeners who need a private-first plant record and optional public proof.",
    localAudience:
      "Gardeners growing on balconies, dachas, village plots, greenhouses, and small household spaces in Ukraine.",
    promise:
      "Keep a living record first, then decide what becomes public proof without exposing precise location.",
    proofPlan: [
      "Private first-entry and same-object follow-up remain the activation core.",
      "Public pages use authored guidance now and real public entries only after explicit publication.",
      "Location stays hidden or coarse-region only; precise coordinates stay out of product surfaces.",
    ],
    localizationHandoff: {
      locale: "uk",
      plannedPath: "/uk/markets/ukraine",
      owningIssue: "OVE-117",
    },
    relatedLinks: [
      {
        label: "Start a private record",
        href: "/garden",
        description:
          "Save the first observation before deciding whether anything becomes public.",
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
      "A public landing page for Bulgarian gardeners who need a private-first plant record and optional public proof.",
    localAudience:
      "Gardeners growing in gardens, yards, greenhouses, terraces, villas, and small household spaces in Bulgaria.",
    promise:
      "Keep a living record first, then decide what becomes public proof without exposing precise location.",
    proofPlan: [
      "Private first-entry and same-object follow-up remain the activation core.",
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
        label: "Start a private record",
        href: "/garden",
        description:
          "Save the first observation before deciding whether anything becomes public.",
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

export function listIndexableAuthoredPublicContentSitemapEntries(): AuthoredPublicContentSitemapEntry[] {
  const entries: AuthoredPublicContentSitemapEntry[] = [
    {
      kind: "editorial_blog",
      path: BLOG_INDEX_PATH,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    ...BLOG_POSTS.map((post) => ({
      kind: post.kind,
      path: post.path,
      changeFrequency: "monthly" as const,
      priority: 0.65,
    })),
    ...GUIDES.map((guide) => ({
      kind: guide.kind,
      path: guide.path,
      changeFrequency: "monthly" as const,
      priority: 0.65,
    })),
    ...ANSWER_PAGES.map((page) => ({
      kind: page.kind,
      path: page.path,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...MARKET_LANDINGS.map((landing) => ({
      kind: landing.kind,
      path: landing.path,
      changeFrequency: "monthly" as const,
      priority: 0.65,
    })),
  ];

  return entries.filter(
    (entry) =>
      evaluatePublicSurfaceIndexability({ kind: entry.kind }).sitemapEligible,
  );
}

export function buildAnswerPageJsonLd(page: AnswerPageContent) {
  const pageUrl = absolutePublicUrl(page.path);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": pageUrl,
        url: pageUrl,
        name: page.title,
        description: page.description,
        inLanguage: "en",
        isPartOf: {
          "@type": "WebSite",
          name: "OverGarden",
          url: absolutePublicUrl("/"),
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: page.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      },
    ],
  };
}
