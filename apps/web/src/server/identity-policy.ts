import "server-only";

import {
  COMMON_LATIN_CYRILLIC_CONFUSABLES,
  COMMON_LEET_FOLD,
  IDENTITY_POLICY_ALLOWLIST,
  IDENTITY_POLICY_DATA_PROVENANCE,
  IDENTITY_POLICY_RULES,
  RESERVED_CUSTOM_HANDLE_PREFIXES,
  RESERVED_CUSTOM_HANDLES,
} from "@/server/identity-policy-data";

const HANDLE_INPUT_CODE_UNIT_LIMIT = 64;
const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_]{2,29}$/;
const TRUSTED_GENERATED_HANDLE_PATTERN =
  /^gardener_[a-f0-9]{16}(?:_[1-9][0-9]?)?$/;

const DISPLAY_NAME_INPUT_CODE_UNIT_LIMIT = 256;
const DISPLAY_NAME_CODE_POINT_LIMIT = 80;
const MAX_COMPARISON_VARIANTS = 24;
const MAX_COMPARISON_TOKENS = 80;
const MAX_ADJACENT_TOKEN_JOIN = 16;
const MAX_COMPARISON_KEY_CODE_POINTS = 64;

const BIDI_CONTROL_PATTERN = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const DEFAULT_IGNORABLE_PATTERN = /\p{Default_Ignorable_Code_Point}/u;
const UNSAFE_SCALAR_PATTERN = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u;
const WHITE_SPACE_PATTERN = /\p{White_Space}/u;
const COMBINING_MARK_PATTERN = /\p{M}/gu;
const TOKEN_PATTERN = /[\p{L}\p{N}]+/gu;
const VISIBLE_IDENTITY_CONTENT_PATTERN =
  /[\p{L}\p{N}\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
const EXTENDED_PICTOGRAPHIC_PATTERN = /\p{Extended_Pictographic}/u;

const EMOJI_JOINER = "\u200d";
const TEXT_VARIATION_SELECTOR = "\ufe0e";
const EMOJI_VARIATION_SELECTOR = "\ufe0f";
const COMBINING_ENCLOSING_KEYCAP = "\u20e3";

const FAILURE = Object.freeze({ ok: false } as const);

export const IDENTITY_POLICY_VERSION =
  IDENTITY_POLICY_DATA_PROVENANCE.policyVersion;

export type PublicIdentitySurface = "handle" | "display_name";

export type PublicHandleSyntaxResult =
  | {
      ok: true;
      handle: string;
      normalizedHandle: string;
      mention: `@${string}`;
    }
  | { ok: false };

export type PublicIdentityPolicyResult =
  | { ok: true; value: string }
  | { ok: false };

interface IdentityKeyCollection {
  all: ReadonlySet<string>;
  full: ReadonlySet<string>;
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function isBoundedComparisonKey(value: string): boolean {
  const length = codePointLength(value);

  return length >= 3 && length <= MAX_COMPARISON_KEY_CODE_POINTS;
}

function foldCharacters(
  value: string,
  replacements: Readonly<Record<string, string>>,
): string {
  let folded = "";

  for (const character of value) {
    folded += replacements[character] ?? character;
  }

  return folded;
}

function removeDefaultIgnorables(value: string): string {
  let visible = "";

  for (const character of value) {
    if (!DEFAULT_IGNORABLE_PATTERN.test(character)) {
      visible += character;
    }
  }

  return visible;
}

function comparisonBase(value: string): string {
  return removeDefaultIgnorables(value.normalize("NFKC").toLowerCase());
}

function collapseRunsAtLeast(
  value: string,
  threshold: number,
  retainedCount: number,
): string | null {
  const characters = Array.from(value);
  let collapsed = "";
  let changed = false;

  for (let index = 0; index < characters.length; ) {
    const character = characters[index];
    let end = index + 1;

    while (end < characters.length && characters[end] === character) {
      end += 1;
    }

    const runLength = end - index;
    if (runLength >= threshold) {
      collapsed += character.repeat(retainedCount);
      changed = true;
    } else {
      collapsed += character.repeat(runLength);
    }

    index = end;
  }

  return changed ? collapsed : null;
}

function buildComparisonVariants(
  value: string,
  includeExcessiveRunTransforms: boolean,
): readonly string[] {
  const base = comparisonBase(value);
  const withoutMarks = base
    .normalize("NFKD")
    .replace(COMBINING_MARK_PATTERN, "");
  const variants = new Set<string>();

  const add = (candidate: string): void => {
    if (candidate && variants.size < MAX_COMPARISON_VARIANTS) {
      variants.add(candidate);
    }
  };

  add(base);
  add(withoutMarks);
  add(foldCharacters(base, COMMON_LEET_FOLD));
  add(foldCharacters(withoutMarks, COMMON_LEET_FOLD));
  add(foldCharacters(base, COMMON_LATIN_CYRILLIC_CONFUSABLES));
  add(foldCharacters(withoutMarks, COMMON_LATIN_CYRILLIC_CONFUSABLES));
  add(
    foldCharacters(
      foldCharacters(base, COMMON_LEET_FOLD),
      COMMON_LATIN_CYRILLIC_CONFUSABLES,
    ),
  );
  add(
    foldCharacters(
      foldCharacters(withoutMarks, COMMON_LEET_FOLD),
      COMMON_LATIN_CYRILLIC_CONFUSABLES,
    ),
  );

  if (includeExcessiveRunTransforms) {
    const initialVariants = [...variants];

    for (const variant of initialVariants) {
      const collapsedToOne = collapseRunsAtLeast(variant, 3, 1);
      const collapsedToTwo = collapseRunsAtLeast(variant, 3, 2);

      if (collapsedToOne !== null) {
        add(collapsedToOne);
      }
      if (collapsedToTwo !== null) {
        add(collapsedToTwo);
      }
    }
  }

  return [...variants];
}

function collectIdentityKeys(
  value: string,
  includeExcessiveRunTransforms: boolean,
): IdentityKeyCollection {
  const all = new Set<string>();
  const full = new Set<string>();

  for (const variant of buildComparisonVariants(
    value,
    includeExcessiveRunTransforms,
  )) {
    const tokens = (variant.match(TOKEN_PATTERN) ?? []).slice(
      0,
      MAX_COMPARISON_TOKENS,
    );
    const compact = tokens.join("");

    if (isBoundedComparisonKey(compact)) {
      full.add(compact);
      all.add(compact);
    }

    for (let start = 0; start < tokens.length; start += 1) {
      let joined = "";
      const end = Math.min(tokens.length, start + MAX_ADJACENT_TOKEN_JOIN);

      for (let cursor = start; cursor < end; cursor += 1) {
        joined += tokens[cursor];

        if (isBoundedComparisonKey(joined)) {
          all.add(joined);
        }

        if (codePointLength(joined) > MAX_COMPARISON_KEY_CODE_POINTS) {
          break;
        }
      }
    }
  }

  return { all, full };
}

function buildBlockedKeys(): ReadonlySet<string> {
  const keys = new Set<string>();

  for (const rule of IDENTITY_POLICY_RULES) {
    for (const value of rule.values) {
      for (const key of collectIdentityKeys(value, false).full) {
        keys.add(key);
      }
    }
  }

  return keys;
}

function buildAllowlistKeys(): ReadonlySet<string> {
  const keys = new Set<string>();

  for (const value of IDENTITY_POLICY_ALLOWLIST) {
    for (const key of collectIdentityKeys(value, false).full) {
      keys.add(key);
    }
  }

  return keys;
}

const BLOCKED_KEYS = buildBlockedKeys();
const ALLOWLIST_KEYS = buildAllowlistKeys();

function hasIntersection(
  candidates: ReadonlySet<string>,
  policyKeys: ReadonlySet<string>,
): boolean {
  for (const candidate of candidates) {
    if (policyKeys.has(candidate)) {
      return true;
    }
  }

  return false;
}

function passesModeration(value: string): boolean {
  const keys = collectIdentityKeys(value, true);

  if (hasIntersection(keys.full, ALLOWLIST_KEYS)) {
    return true;
  }

  return !hasIntersection(keys.all, BLOCKED_KEYS);
}

function isEmojiFormattingContext(segment: string): boolean {
  return (
    EXTENDED_PICTOGRAPHIC_PATTERN.test(segment) ||
    segment.includes(COMBINING_ENCLOSING_KEYCAP)
  );
}

function sanitizeDisplayName(raw: string): string | null {
  if (
    typeof raw !== "string" ||
    raw.length > DISPLAY_NAME_INPUT_CODE_UNIT_LIMIT ||
    BIDI_CONTROL_PATTERN.test(raw)
  ) {
    return null;
  }

  const normalized = raw.normalize("NFKC");
  if (BIDI_CONTROL_PATTERN.test(normalized)) {
    return null;
  }

  const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
  let sanitized = "";

  for (const { segment } of segmenter.segment(normalized)) {
    const emojiFormattingContext = isEmojiFormattingContext(segment);

    for (const character of segment) {
      if (DEFAULT_IGNORABLE_PATTERN.test(character)) {
        if (
          emojiFormattingContext &&
          (character === EMOJI_JOINER ||
            character === TEXT_VARIATION_SELECTOR ||
            character === EMOJI_VARIATION_SELECTOR)
        ) {
          sanitized += character;
        }

        continue;
      }

      if (WHITE_SPACE_PATTERN.test(character)) {
        sanitized += " ";
        continue;
      }

      if (UNSAFE_SCALAR_PATTERN.test(character)) {
        return null;
      }

      sanitized += character;
    }
  }

  const canonical = sanitized.replace(/\p{White_Space}+/gu, " ").trim();
  const length = codePointLength(canonical);

  if (
    length < 1 ||
    length > DISPLAY_NAME_CODE_POINT_LIMIT ||
    !VISIBLE_IDENTITY_CONTENT_PATTERN.test(canonical)
  ) {
    return null;
  }

  return canonical;
}

/**
 * Parses route/read syntax only. This intentionally does not apply the
 * mutable moderation policy, because policy changes must not retroactively
 * make an existing or retired public identity impossible to resolve.
 */
export function parsePublicHandleSyntax(raw: string): PublicHandleSyntaxResult {
  if (typeof raw !== "string" || raw.length > HANDLE_INPUT_CODE_UNIT_LIMIT) {
    return FAILURE;
  }

  const trimmed = raw.trim();
  const withoutMentionPrefix = trimmed.startsWith("@")
    ? trimmed.slice(1)
    : trimmed;
  const normalizedHandle = withoutMentionPrefix.normalize("NFKC").toLowerCase();

  if (!HANDLE_PATTERN.test(normalizedHandle)) {
    return FAILURE;
  }

  return {
    ok: true,
    handle: normalizedHandle,
    normalizedHandle,
    mention: `@${normalizedHandle}`,
  };
}

/**
 * Recognizes only server-generated, non-PII handles in the protected
 * namespace. The optional suffix is reserved for bounded uniqueness retries.
 */
export function isTrustedGeneratedHandle(value: string): boolean {
  return (
    typeof value === "string" && TRUSTED_GENERATED_HANDLE_PATTERN.test(value)
  );
}

/**
 * Applies the current write-time policy. Rejections are intentionally generic:
 * callers receive no matched term, category, normalized candidate, or reason.
 */
export function evaluatePublicIdentity(input: {
  surface: PublicIdentitySurface;
  value: string;
}): PublicIdentityPolicyResult {
  if (input.surface === "handle") {
    const parsed = parsePublicHandleSyntax(input.value);

    if (!parsed.ok) {
      return FAILURE;
    }

    if (
      RESERVED_CUSTOM_HANDLES.has(parsed.normalizedHandle) ||
      RESERVED_CUSTOM_HANDLE_PREFIXES.some((prefix) =>
        parsed.normalizedHandle.startsWith(prefix),
      ) ||
      !passesModeration(parsed.normalizedHandle)
    ) {
      return FAILURE;
    }

    return { ok: true, value: parsed.normalizedHandle };
  }

  if (input.surface === "display_name") {
    const canonical = sanitizeDisplayName(input.value);

    if (canonical === null || !passesModeration(canonical)) {
      return FAILURE;
    }

    return { ok: true, value: canonical };
  }

  return FAILURE;
}
