# Localization Coverage Workflow

Status: binding completion and extension contract after OVE-171
Locales: `uk`, `bg`, `ru`
Baseline: `ove171-v1`

## Completion Gate

Run from `apps/web`:

```bash
pnpm localization:coverage:check
pnpm localization:coverage:report
```

The check fails closed when a current `src/app` page or route handler is not
registered, a registered route disappears, a translated namespace loses a
locale/key/value, direct authored UI or metadata copy bypasses a namespace, a
required edge state disappears, or an owner loses deterministic 320/1440
browser evidence. The report adds the current commit SHA, baseline and fixture
hashes, totals, exact route ownership, state classes, focused tests, redacted
exclusions, preserved-baseline versus OVE-171-closed dispositions, grouped
closed deltas, and the zero-gap result.

`pnpm localization:coverage:browser` reuses the OVE-185/186 responsive fixture
runner. Its exact owner matrix adds 13 probes at 320px and 1440px, including a
real moderator fixture on the operator route and an unauthorized operator
boundary. It verifies `html[lang]`, `Content-Language`, canonical and hreflang
metadata, the persisted selected locale, and auth-intent continuity at the
real rendered boundary. CI runs the static gate before the unit suite and runs
the shared browser matrix later in the same job.

## Route Classes

Every current route module is explicitly owned in
`src/lib/localization/localization-coverage.ts` as one of:

- public localized UI;
- signed-in UI using the selected locale on an unprefixed URL;
- operator UI using the explicit selected locale;
- redirect-only handler;
- API/non-UI handler;
- isolated internal fixture UI.

The registry records locale/auth/role variants, state classes, copy namespaces,
focused tests, and OVE-187 scenario proof for each rendered owner. Registration
is exact by source file; there is no catch-all rule for a new page.

## Extending The Product

When adding a new page, route handler, rendered state, or visible component:

1. Add the route to the exact registry with the correct classification and
   owner. Do not classify a rendered page as API, redirect-only, or fixture UI.
2. Extend an existing typed locale namespace, or add one loader to
   `LOCALIZATION_COPY_NAMESPACES`. Keep `uk`, `bg`, and `ru` key shapes exact.
3. Add loading, empty, dense, pagination, validation, success, error,
   unauthorized, archived, 404/410, offline, dialog/menu/tooltip/toast proof as
   the behavior requires. Reuse the OVE-187 fixtures instead of fake snapshots.
4. Add a focused test and a 320/1440 owner scenario. Preserve locale through
   navigation, auth intent, resume, and mutation return paths.
5. Run the check, report, focused tests, fixture verification, browser gate,
   typecheck, lint, full tests, build, and mainline closeout.

## Literal Exclusions

The authored-copy scanner uses the TypeScript AST rather than a blanket English
grep. An exclusion must identify one exact source file, literal kind, and value,
plus a supported reason and concrete rationale. Allowed classes are immutable
brand/provider names, scientific/catalog/user content, URLs or identifiers,
diagnostics, and isolated fixture labels. Wildcards, generic English product
phrases, temporary exemptions, and unreasoned entries fail the gate.

Reports never include secrets, tokens, private content, precise location,
quarantine keys, signed URLs, emails, or raw diagnostic payloads. Suspicious
literal values are hashed before they can appear in a failure report.
