import "server-only";

/**
 * Policy data is deliberately server-only. It must never be imported by a
 * client component, serialized into a response, or copied into analytics.
 */
export type IdentityPolicyCategory =
  | "profanity"
  | "hate"
  | "sexual_obscenity"
  | "violent_threat"
  | "extremism"
  | "harassment"
  | "impersonation";

export interface IdentityPolicyRule {
  readonly id: string;
  readonly category: IdentityPolicyCategory;
  readonly values: readonly string[];
}

export const IDENTITY_POLICY_DATA_PROVENANCE = {
  schema: "ove203.identity-policy-data-provenance.v1",
  policyVersion: "ove203-identity-v1",
  effectiveDate: "2026-07-18",
  locales: ["uk", "bg", "ru"] as const,
  origin: "original_overgarden_high_confidence_curation",
  reviewMethod:
    "conservative manual curation with explicit transliteration, evasion, and benign-near-match regression",
  thirdPartyWordlistsCopied: false,
  unicodeReference: {
    standard: "Unicode Technical Standard #39",
    version: "17.0.0",
    specificationUrl: "https://www.unicode.org/reports/tr39/",
    licenseUrl: "https://www.unicode.org/license.txt",
    usage:
      "design reference only; this policy does not vendor the Unicode confusables data file",
    license: "Unicode-3.0",
  },
  redistribution:
    "original policy data has no standalone open-source license; repository ownership terms apply",
} as const;

/**
 * High-confidence values only. Ambiguous short fragments and fuzzy matching
 * are intentionally absent. The policy engine compares normalized whole
 * tokens or bounded adjacent-token joins, never arbitrary substrings.
 */
export const IDENTITY_POLICY_RULES: readonly IdentityPolicyRule[] = [
  {
    id: "IPR-001",
    category: "extremism",
    values: [
      "nazi",
      "nazist",
      "hitler",
      "нацист",
      "нацисти",
      "нацисты",
      "гітлер",
      "гитлер",
      "хитлер",
      "natsyst",
      "natsist",
      "nacist",
      "gitler",
    ],
  },
  {
    id: "IPR-002",
    category: "extremism",
    values: [
      "terror",
      "terrorist",
      "терор",
      "террор",
      "терорист",
      "террорист",
      "teroryst",
      "terorist",
    ],
  },
  {
    id: "IPR-003",
    category: "hate",
    values: [
      "nigger",
      "nigga",
      "ниггер",
      "нигга",
      "pidoras",
      "pederast",
      "пидорас",
      "педераст",
    ],
  },
  {
    id: "IPR-004",
    category: "hate",
    values: [
      "death to ukrainians",
      "смерть українцям",
      "смърт на украинците",
      "смерть украинцам",
      "smert ukraintsiam",
      "smart na ukraintsite",
      "smert ukraintsam",
    ],
  },
  {
    id: "IPR-005",
    category: "sexual_obscenity",
    values: [
      "rape",
      "rapist",
      "гвалтівник",
      "насильник",
      "iznasilvach",
      "iznasilovatel",
    ],
  },
  {
    id: "IPR-006",
    category: "profanity",
    values: [
      "хуй",
      "хуйло",
      "khui",
      "khuy",
      "hui",
      "huy",
      "пізда",
      "пизда",
      "pizda",
      "putka",
      "путка",
    ],
  },
  {
    id: "IPR-007",
    category: "profanity",
    values: [
      "єбати",
      "їбати",
      "ебати",
      "ебать",
      "yebaty",
      "yibaty",
      "ebaty",
      "ebat",
      "блядь",
      "бляд",
      "bliad",
      "blyad",
    ],
  },
  {
    id: "IPR-008",
    category: "harassment",
    values: [
      "whore",
      "повія",
      "шлюха",
      "курва",
      "poviia",
      "shliuha",
      "shlyuha",
      "kurva",
    ],
  },
  {
    id: "IPR-009",
    category: "violent_threat",
    values: [
      "kill yourself",
      "go kill yourself",
      "вбий себе",
      "убий себе",
      "убий се",
      "vbyi sebe",
      "ubiy sebya",
      "ubii se",
    ],
  },
  {
    id: "IPR-010",
    category: "violent_threat",
    values: [
      "kill you",
      "вбити тебе",
      "убью тебя",
      "ще те убия",
      "vbyty tebe",
      "ubyu tebya",
      "shte te ubiya",
    ],
  },
  {
    id: "IPR-011",
    category: "impersonation",
    values: [
      "admin",
      "administrator",
      "moderator",
      "support",
      "helpdesk",
      "staff",
      "root",
      "system",
      "official",
      "verified",
      "адмін",
      "админ",
      "адміністратор",
      "администратор",
      "модератор",
      "підтримка",
      "поддръжка",
      "поддержка",
      "служба підтримки",
      "служба поддержки",
      "официален",
      "официальный",
      "офіційний",
      "верифікований",
      "верифицированный",
    ],
  },
  {
    id: "IPR-012",
    category: "impersonation",
    values: [
      "overgarden",
      "over garden",
      "overgarden support",
      "overgarden admin",
      "overgarden official",
    ],
  },
] as const;

/**
 * These are reviewed full-identity exceptions, not substring exceptions. An
 * input must reduce to the complete allowlisted identity before it can pass.
 */
export const IDENTITY_POLICY_ALLOWLIST = [
  "grape",
  "grape gardener",
  "grapeseed",
  "grapefruit",
  "rapeseed",
  "therapist garden",
  "scunthorpe rose",
  "anti nazi",
  "stop rape",
  "rape survivor",
  "анти нацист",
  "проти нацизму",
  "срещу нацизма",
  "против нацизма",
] as const;

/**
 * Exact custom-handle reservations retain the existing route/system contract.
 * They do not apply to ordinary display-name words such as "garden".
 */
export const RESERVED_CUSTOM_HANDLES = new Set([
  "about",
  "account",
  "admin",
  "api",
  "auth",
  "blog",
  "catalog",
  "erasure",
  "garden",
  "gardener",
  "guide",
  "guides",
  "health",
  "help",
  "home",
  "join",
  "lineage",
  "login",
  "logout",
  "market",
  "markets",
  "me",
  "moderator",
  "overgarden",
  "privacy",
  "profile",
  "profiles",
  "robots",
  "root",
  "settings",
  "signup",
  "sitemap",
  "support",
  "user",
  "users",
  "variety",
  "uk",
  "bg",
  "ru",
]);

export const RESERVED_CUSTOM_HANDLE_PREFIXES = [
  "gardener_",
  "demo_",
  "visual_",
] as const;

/**
 * A deliberately small Latin/Cyrillic visual fold for the scripts OverGarden
 * supports. It is project-authored and is not a copied Unicode data subset.
 * The result is an internal comparison skeleton and is never stored/rendered.
 */
export const COMMON_LATIN_CYRILLIC_CONFUSABLES: Readonly<
  Record<string, string>
> = {
  а: "a",
  с: "c",
  е: "e",
  н: "h",
  і: "i",
  ј: "j",
  к: "k",
  м: "m",
  о: "o",
  р: "p",
  ѕ: "s",
  у: "y",
  х: "x",
};

export const COMMON_LEET_FOLD: Readonly<Record<string, string>> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "!": "i",
  $: "s",
  "@": "a",
};
