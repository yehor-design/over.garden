# Localization Coverage Workflow

Status: OVE-205 closeout gate passed; binding OVE-208 typography extension workflow
Locales: `uk`, `bg`, `ru`
Markets: Ukraine (`uk` only), Bulgaria (`bg` default; `bg` or `ru`)
Preserved baseline: `ove171-v1`
Date: 2026-07-22

## Completion Gate

Run from `apps/web` against one unchanged commit:

The static report refuses a dirty checkout and a mismatched `GITHUB_SHA`; its
`commitSha` is evidence only for the exact clean tree that generated it.

```bash
pnpm typography:assets:check
pnpm localization:coverage:check
pnpm localization:coverage:report
pnpm localization:coverage:browser
pnpm visual:fixtures:verify
TYPOGRAPHY_BASE_URL=http://127.0.0.1:3000 pnpm typography:browser
pnpm test:a11y
```

Then run the focused locale, proxy, route, preference-mutation, coordinator,
accessibility, typecheck, lint, full-test, build, mainline-closeout, and
production-smoke commands named by the owning Linear issue. A generated report
is evidence only when its commit, fixture baseline, and browser run all match
the candidate SHA. OVE-205 discharged this gate on behavior commit
`b6145c1a3c176df5ef8634961b5d5642d5b87cbf`; later owning slices must rerun it
against their own candidate SHA.

The schema-v3 static report separates `regressionGreen` from completion
readiness. A zero exit code means the fail-closed registry has not regressed;
by itself it is not completion proof for the owning slice. For OVE-205, the
report kept the mandatory fresh browser run as a completion reason because
static analysis cannot attest runtime freshness; the successful candidate-SHA
browser artifact discharged that reason during closeout.
`downstreamOwnedUiGates` remain visible for OVE-202/206/207 with
`blocksCurrentIssue: false`; they are binding future ownership, not OVE-205
failures. A future owning slice must not move to Done from the static command
alone or describe its downstream UI as already proven.

The `ove171-v1` gate and its copy namespaces are preserved regression inputs.
They were not sufficient OVE-205 evidence: the old inventory classified page
and route modules but did not fail closed over every layout, loading/error
boundary, not-found/global-error state, or raw application-owned lifecycle
renderer.

## Fail-Closed Discovery

The registry discovers and exactly classifies every current application-owned
surface under `src/app` and any out-of-tree raw lifecycle renderer:

- `page.tsx` and `route.ts`;
- `layout.tsx`;
- `loading.tsx`;
- `error.tsx` and `global-error.tsx`;
- `not-found.tsx` and route-owned `404`/`410` UI;
- application-owned raw HTML returned for lifecycle/error states;
- isolated internal fixture UI, redirect-only handlers, and true non-UI API
  handlers.

Registration is exact by source file and rendered owner. There is no catch-all
classification. A newly discovered module/renderer, a stale registry entry,
an unowned language control, or a rendered state classified as API/redirect
fails CI.

## Required Registry Attributes

Each rendered route/state record declares:

- interface market source and fail-closed market fallback;
- allowed locales and market default;
- canonical URL class: Ukraine unprefixed, Bulgaria `/bg` or `/ru`, or canonical
  unprefixed product/auth/garden/operator;
- language-control expectation (`zero` or `exactly-one`) and its single owner;
- switch mode: localized public document link or narrow unprefixed POST
  preference mutation;
- target builder and allowlisted query/fragment policy, when applicable;
- auth, role, owner/non-owner, denied, loading, empty, error, `404`, `410`, and
  raw lifecycle variants;
- dirty/in-flight coordinator registration and expected outcome;
- shared proportional/monospace typography token ownership for the rendered
  document, including exceptional raw lifecycle and global-error owners;
- copy namespaces, literal exclusions, focused tests, and deterministic browser
  scenarios;
- mobile and desktop evidence requirements.

Every namespace keeps exact recursive key/value presence across `uk`, `bg`,
and `ru`, even though Ukraine can render only `uk`. UGC, catalog/scientific
names, official sources, and literal evidence remain untranslated source
values.

## Market And Control Matrix

The deterministic browser matrix must include at least:

- Ukraine trusted signal, missing signal, and unsupported signal: unprefixed
  canonical URL, `uk`, and zero controls;
- Ukraine with stale persisted `bg` or `ru`: `uk`, zero controls, and no
  cross-market redirect;
- Bulgaria with no valid preference: `bg` default and exactly one control;
- Bulgaria with valid `bg` and `ru` choices, including persisted continuity;
- Bulgaria with stale `uk`, malformed, or unsupported preference: `bg` default;
- direct `/bg` and `/ru` public routes and safe equivalent-route switching;
- legacy `/uk` redirect without `/uk` canonical, sitemap, hreflang, or generated
  navigation output;
- every public, auth, garden, account, operator, authorized, denied, loading,
  error, not-found, global-error, and application-owned `404`/`410` owner;
- owner and non-owner/private boundaries without exposing private evidence;
- exactly one visible and accessible Bulgaria control, and zero Ukraine
  controls, at all required viewport/state combinations;
- root `html[lang]`, `Content-Language`, canonical, hreflang, metadata, focus,
  keyboard, screen-reader, reflow, and reduced-motion behavior.

Counting a control in a shared happy-path shell is not enough. The assertion is
made at the final rendered document for every registered owner/state.

OVE-208 adds a focused typography gate across Chromium, Firefox, and WebKit. It
proves Google Sans as the computed proportional family, successful font loading
and same-origin requests, Ukrainian/Bulgarian/Russian glyph coverage,
`html[lang="bg"]` localized-form ownership, real italic, semantic Geist Mono,
and the raw lifecycle/global-error owners. This focused gate extends the full
Chromium localization, responsive, and accessibility matrix; it never replaces
that matrix or reduces its 171 scenarios and 642 route/viewport checks.

## Switch Security Matrix

Localized public switching must prove that only route-approved filter,
pagination/sort, and same-resource fragment state survives `/bg` <-> `/ru`.
Unknown/duplicate query values, raw return URLs, tokens, private IDs, drafts,
form text, mutation payloads, and cross-resource fragments must be dropped or
rejected.

The canonical unprefixed preference boundary must prove:

- POST-only, same-origin, supported content type, bounded Bulgaria market, and
  exact `bg|ru` enum acceptance;
- refusal of GET, cross-origin, prefetch, RSC, server-action lookalikes,
  Ukraine-market mutations, extra fields, invalid values, and oversized input;
- `no-store`, no reflected private input, no return URL, no open redirect, and
  no mutation/domain side effect;
- a hard no-referrer reload of the same canonical URL after success.

## Dirty And In-Flight Matrix

The shared locale-change coordinator must have deterministic proof for:

- clean immediate navigation;
- a successful safe local flush before navigation;
- dirty stay/cancel and explicit discard/continue outcomes;
- duplicate-choice suppression while flush, upload, sync, auth intent, or
  canonical mutation work is in flight;
- failure and unknown completion state that remain fail-closed;
- cross-tab and BFCache convergence without identity in the signal;
- no replay of product mutations and no draft/token/media/private data in the
  URL, cookie, header, report, or analytics payload.

Register current product states only. The founder-approved 2026-07-22 ownership
clarification resolves the earlier addendum contradiction without changing the
dependency order. The schema-v3 ledger assigns real structured-editor and
ten-inline-photo proof to OVE-202, reorder proof to OVE-206, and cover plus
combined ten-inline-plus-one-cover proof to OVE-207. Those slices must consume
the shared coordinator and replace only their own ledger entry with real
product-browser scenarios. Adapter-only registration or an internal fixture is
not proof for the owning downstream issue. OVE-202 must also consume the shared
proportional token, load a real italic face, and serialize no `font-family`
styling into Editor.js content.

## Extending The Product

When adding a page, layout, handler, rendered state, or visible component:

1. Register the exact source and rendered owner with every required attribute.
2. Extend an existing typed locale namespace, or add one exact-parity loader.
3. Add every behavior-relevant state: loading, empty, dense, pagination,
   validation, success, error, unauthorized, archived, `404`/`410`, offline,
   dialog/menu/tooltip/toast, and raw lifecycle output.
4. Select the market-specific control rule and one owner. Never add an ad hoc
   second switcher.
5. Consume the shared proportional or semantic monospace token; never add an ad
   hoc font family.
6. Register dirty/in-flight behavior when user work or a product mutation can
   be active.
7. Add focused tests and deterministic mobile/desktop browser scenarios using
   the OVE-187 fixture environment where safe.
8. Run the complete gate and refresh exact-SHA release proof.

## Literal Exclusions And Evidence Privacy

The authored-copy scanner uses the TypeScript AST rather than a blanket English
grep. An exclusion identifies one exact source file, literal kind, value,
supported class, and concrete rationale. Allowed classes are immutable
brand/provider names, scientific/catalog/user content, URLs/identifiers,
diagnostics, and isolated fixture labels. Wildcards, generic authored phrases,
temporary exemptions, and unreasoned entries fail the gate.

Reports and browser artifacts never include secrets, tokens, private content,
precise location, quarantine keys, signed URLs, emails, raw diagnostics, or
identity-bearing cross-tab payloads. Suspicious literal values are hashed
before they can appear in a report.

Typography evidence records only bounded font paths, bytes, cache behavior,
and computed results. Font URLs and cache identities remain same-origin and
must not contain or vary on locale cookies, account state, private data, or
referrers.

## Production Proof

Deterministic fixtures are loopback-only and must refuse Production. They prove
rendered variants locally; they do not substitute for a fresh deployment smoke.
Production proof runs separately against the exact deployed candidate SHA and
uses redacted, public-safe assertions for Ukraine zero-control behavior,
Bulgaria `bg` default, `/bg`/`/ru` switching, one-control ownership, canonical
metadata, and the narrow preference boundary. Any exact-SHA, deployment,
provider, DNS, security, or browser failure keeps the owning slice open.
