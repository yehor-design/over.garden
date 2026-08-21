# Public identity policy

Status: active MVP contract
Policy version: `ove203-identity-v1`
Effective date: 2026-07-18
Owner: OverGarden product and trust maintainers

## Purpose

This document defines the server-side policy for public profile handles and
display names. It supports Ukrainian, Bulgarian, and Russian product surfaces
while protecting users from high-confidence abusive identities, deceptive
operator impersonation, invisible-text evasion, and custom claims on reserved
namespaces.

The policy is deliberately deterministic and conservative. It is a write-time
MVP safety boundary, not a general-purpose toxicity classifier. Human reporting
and moderation remain necessary for harmful context that cannot be identified
reliably from a short public identity alone.

The implementation authority is:

- `apps/web/src/server/identity-policy.ts` for normalization and evaluation;
- `apps/web/src/server/identity-policy-data.ts` for versioned rules,
  reservations, allowlist entries, and provenance;
- `apps/web/src/server/identity-policy-fixtures.ts` for server-only regression
  inputs with opaque test identifiers;
- `apps/web/src/server/identity-policy.test.ts` for executable invariants.

All four TypeScript modules are server-only. Policy data and rejected values
must not be imported into client components or serialized into responses.

## Public API contract

`IDENTITY_POLICY_VERSION` exposes the exact policy version stored with an
accepted identity write.

`parsePublicHandleSyntax(raw)` performs syntax parsing only. It returns either a
canonical lowercase handle, normalized handle, and mention, or the generic
`{ ok: false }` result. It does not apply reserved-name or abuse rules.

`evaluatePublicIdentity({ surface, value })` applies the current write-time
policy to either `handle` or `display_name`. It returns the canonical value on
success and exactly `{ ok: false }` on any rejection.

`isTrustedGeneratedHandle(value)` recognizes the protected server-generated
handle grammar. It does not grant user input permission to claim that grammar.

No rejection API returns a reason, matched value, policy category, raw input,
comparison skeleton, or normalized candidate. User-facing forms should use one
generic localized identity-policy message and preserve the user's editable form
state locally.

## Read and write separation

Every user-controlled identity creation or change must call
`evaluatePublicIdentity` immediately before persistence. This includes profile
editing, handle availability checks that represent an intended write, admin
edits, imports, and future API clients.

Route resolution, mention resolution, retired-handle lookup, redirects, and
historical reads must use `parsePublicHandleSyntax` only. Applying today's
moderation rules to a read would make an existing or retired identity disappear
when the policy changes, breaking public URLs and lifecycle evidence.

An existing identity is therefore never silently invalidated during a normal
read. If a new policy version requires action on stored identities, maintainers
must use an explicit, auditable migration or moderation workflow with a defined
appeal and rollback path.

## Cross-user handle mentions

Mention typeahead may resolve the target's Better Auth user ID inside the
server repository, but that ID must never cross the HTTP boundary. The server
returns a bounded AES-256-GCM selection token derived from
`BETTER_AUTH_SECRET`, domain-separated for handle mentions, and cryptographically
bound to the requesting user. The fixed encrypted payload contains only a
version and the target user ID; it contains no handle, email, provider name,
timestamp, location, or redirect. Tokens have no expiry so an owner-isolated
server-retained draft remains saveable after a delay or target-handle rename, and they
require no token registry or other remote state.

On journal save, the server must authenticate and decrypt every token for the
current requester, deduplicate the resulting target IDs, and revalidate that
each target is still a current, public, active, non-removed profile with no
mutual block. Only then may it persist the stable target in
`source_owner_user_id`; the mutable handle label remains `null`. Malformed,
tampered, wrong-audience, legacy raw-UUID, missing-target, private-profile, and
blocked-target cases use one generic unavailable result and must never log the
token or resolved user ID. A retired handle is never resolved or redirected to
the user's current handle.

## Handle contract

A canonical custom handle:

- is 3-30 characters;
- starts with an ASCII lowercase letter or digit;
- contains only ASCII lowercase letters, digits, and underscores;
- accepts one optional leading `@` and surrounding whitespace as input;
- is normalized with NFKC and locale-independent lowercase conversion;
- cannot equal a reserved route/operator identity;
- cannot start with a protected generated, demo, or visual-fixture namespace;
- must pass the current identity policy.

The protected generated grammar is
`gardener_<16 lowercase hexadecimal characters>` with an optional uniqueness
suffix from `_1` through `_99`. Only internal provisioning code may accept a
value after `isTrustedGeneratedHandle` returns true. A user-controlled custom
write is rejected even when its input happens to match the generated grammar.

Generated handles contain no email local part, display name, user UUID, or
other user-provided identifier. Their entropy source and collision retry are
owned by the provisioning repository, not by this policy module.

## Display-name contract

A canonical display name:

- is normalized with NFKC;
- collapses Unicode whitespace to a single ASCII space and trims the result;
- contains 1-80 Unicode code points after canonicalization;
- contains at least a letter, number, or recognizable emoji;
- rejects bidi embedding, override, mark, and isolate controls;
- strips other default-ignorable formatting characters used outside a valid
  emoji grapheme;
- rejects unsafe control, format, surrogate, private-use, and unassigned code
  points that remain after sanitization;
- must pass the current identity policy.

Emoji ZWJ and variation-selector sequences are preserved only inside graphemes
with an extended pictographic or keycap context. This keeps legitimate family,
profession, heart, and keycap emoji intact without treating arbitrary zero-width
characters as display content.

## Deterministic moderation

The curated data covers high-confidence profanity, hate, sexual obscenity,
violent threats, extremist identities, harassment, and operator/platform
impersonation in Ukrainian, Bulgarian, Russian, and reviewed transliterations.
Ambiguous short fragments are intentionally excluded.

For comparison only, the evaluator creates a bounded set of variants:

1. NFKC and locale-independent lowercase;
2. removal of default-ignorable code points;
3. mark removal after NFKD;
4. a small project-authored leetspeak fold;
5. a small project-authored Latin/Cyrillic visual-confusable fold;
6. collapse of input runs of three or more repeated characters to one and two
   characters.

The evaluator then compares whole letter/number tokens, joins of at most 16
adjacent tokens, and the complete compact identity. It never performs arbitrary
substring matching and never calls a remote moderation service. Comparison is
bounded to 24 variants, 80 tokens, and 64 code points per comparison key.
Handle input is rejected above 64 UTF-16 code units; display-name input is
rejected above 256 UTF-16 code units before transforms begin.

Reviewed benign exceptions are full-identity allowlist entries. An exception
does not permit the same blocked token inside a longer or modified identity.
Near-match regressions are mandatory whenever a new rule could collide with a
legitimate name, place, horticultural term, or advocacy phrase.

## Privacy and observability

Raw identity candidates, normalized candidates, comparison variants, matched
rules, and fixture values must never be logged, placed in analytics, exposed in
error responses, or attached to operator proof. Safe telemetry is limited to
aggregate counters such as accepted/rejected outcome, surface, policy version,
and coarse request context already allowed by the project's privacy rules.

Test titles and CI failures use opaque fixture identifiers only. Rejected
fixture values remain in the server-only fixture source and must not be copied
into snapshots or documentation.

## Stable mentions and historical journal text

Person mentions persist the target's internal user id, never the handle that was
visible when the mention was selected. Owner provenance readback resolves that
stable target through its matching current handle claim and active public
profile. If the profile becomes private, is removed, loses its matching current
claim, or either account actively blocks the other, the identity fails closed
to the generic private-source presentation.

Public journal readback exposes a person mention only when the edge is active
and confirmed, the journal remains public and active, the target has a matching
current public profile, and no active block exists in either direction. The
public response contains the current handle and localized profile path but no
user id, old handle, raw provenance label, or block row.

Journal body text is immutable historical user content. A rename therefore does
not rewrite an old `@handle` string embedded in that body. The UI renders the
current identity in a separate structured mention section backed by the stable
user-id read model. Tests must prove both properties together: the historical
body remains byte-for-byte unchanged while structured readback changes to the
new current handle.

## Provenance and licensing

The policy data is an original, conservative OverGarden curation. It does not
copy a third-party profanity wordlist. The small confusable fold is also
project-authored. The regression corpus is separately versioned as
`ove203-identity-fixtures-v1`, is original OverGarden curation, and copies no
third-party fixture set.

[Unicode Technical Standard #39 version 17.0.0](https://www.unicode.org/reports/tr39/)
informed the confusable-security design. OverGarden does not vendor the Unicode
confusables data file and does not claim full UTS #39 conformance. Unicode's
[referenced data license](https://www.unicode.org/license.txt) is
`Unicode-3.0`; the original OverGarden policy data has no standalone open-source
license, so repository ownership terms apply.

## Maintenance and policy changes

Every policy change must:

1. use a new opaque rule or fixture identifier without renumbering history;
2. add rejection coverage and at least one relevant benign-near-match test;
3. be reviewed for Ukrainian, Bulgarian, Russian, and transliteration impact;
4. avoid fuzzy matching and ambiguous fragments unless a later explicit policy
   decision replaces this conservative contract;
5. increment the policy version when accepted/rejected behavior changes;
6. preserve generic failure responses and the read/write separation;
7. document provenance and redistribution rights for any proposed external
   source before its data enters the repository;
8. define an explicit stored-identity migration plan before enforcing the new
   version retroactively.

Run the focused proof with:

```sh
cd apps/web
pnpm vitest run src/server/identity-policy.test.ts
```

The proof covers native-language, transliterated, separator, leetspeak,
confusable, repeated-character, NFKC, zero-width, bidi, emoji, generated
namespace, allowlist, deterministic-output, bounded-input, and non-disclosure
invariants.
