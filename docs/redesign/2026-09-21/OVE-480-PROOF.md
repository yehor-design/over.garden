# Representative fixtures and accessibility gates — OVE-480

Implementation date: 2026-09-21. Baseline application build:
`6b5a70402282adf021cae354ffc7c23b70496e2e`. The exact tested branch SHA, CI run,
merge SHA and production deployment belong in the Linear release receipt.
This document does not predeclare release success.

## Delivered

- Synthetic collection presets 0/0, 1/0, 1/1, 3/100 and 20/1000, verified against
  persisted counts, with duplicate object labels across distinct spaces and long
  UK/BG/RU names. Explicitly deleted destinations and invalid unassigned boundary
  values preserve the accepted NOT NULL space contract.
- Real authentication for ordinary member, guest, sealed owner and expired
  session; member fixture renders a 1,000-object garden. Expiry removes the
  session-cookie cache before proving the server returns no session.
- Text-only, portrait, landscape and multiple-photo public entries; browser-made
  deterministic WebP pixels served locally, actual byte counts, mixed-script and
  long text, persisted media counts and successfully decoded browser images.
- Reusable keyboard traversal, dialog trap/return, live message, pending-name,
  field-error and reflow assertions. Existing production-build server-failure,
  no-JavaScript, keyboard-publication and static-document proofs remain enabled.
- Fifteen real component specimens: UK/BG/RU × 320/390/768/1280/1920 CSS px;
  200% text, forced colors, reduced motion, keyboard and WCAG 2.2 AA scans.
  The loading specimen now has a valid status role; no axe rule is disabled.
- Three desired-behavior baseline tests, registered in CI with explicit expected
  failures until the corresponding migration. Enforced ordinary failures are
  recorded in `ove-480/baseline-failures.txt`, including actual received values.

No production data, runtime page, schema, visibility or durable-state change.
All journal fixtures are public. The older default entry fixture remains
backwards compatible; `photographs: []` now creates a genuinely text-only entry.

## Verification

Run from `apps/web`, against the existing production build and an isolated local
Postgres database with current migrations:

- `pnpm test`: 559 test files / 4,274 tests passed, 6 files / 29 tests skipped by
  their existing conditions; media-worker suite 14 tests passed. All mechanical
  checks including registered browser specs passed.
- `pnpm lint`, `pnpm typecheck`, `git diff --check`: passed.
- `pnpm exec playwright test tests/component-specimens.spec.ts --workers=1`
  with `PLAYWRIGHT_BASE_URL` set to the local server: 15 passed (34.9 seconds).
- `REDESIGN_ENFORCE_BASELINES=1 pnpm exec tsx scripts/run-browser-gate.ts
  --spec=redesign-baselines.spec.ts --port=3188`: expected nonzero exit, all three
  desired-behavior assertions failed for the documented UX defects.
- Full registered production-build gate: see final command receipt in
  `ove-480/verification.json` and the clean-checkout CI attached to the PR.

`ove-480/axe-summary.json` records all fifteen engine/rule results: axe-core
4.12.1, WCAG 2/2.1/2.2 AA tags, installed 2.2 rule `target-size`, zero violations,
zero incomplete results. This covers these specimens, not every product page.
The earlier local run had a fixture assertion inconsistent with the canon's
focusable busy button; that assertion was corrected to require busy semantics
and a retained accessible name. A subsequent scan exposed the loading fixture's
invalid generic-div label and the helper was made to await focus transitions.
The last local full run passed 195 cases with one external-fixture skip but
failed the publication-notice setup on a real 429 signin response. The existing
helper retried signup but not signin. This task adds bounded retries only for
429, cleanup when the caller never receives an account ID, and two regression
unit tests (429 then 200; 401 without retry). The focused publication-notice browser rerun passed both cases (1.8s);
clean-checkout CI must pass before merge. None of the failed runs is relabeled
as a pass.

## Limits and subsequent work

Read `ACCESSIBILITY_FIXTURES.md` for the full coverage matrix and reproducible
VoiceOver/NVDA protocol. Screen-reader sessions were **not performed** for this
infrastructure task. 320 CSS pixels model the reflow width of a 1280px viewport
at 400%; they do not claim actual browser-UI zoom or operating-system AT proof.
Synthetic media tests prove layout/transport, not R2 promotion or production LCP.
Unassigned values are invalid boundaries, not a new supported object model.

OVE-482 and OVE-483/486 must remove their expected-failure annotations as they
correct those behaviors. OVE-478 must not sign off with any of them still
expected to fail. Runtime behavior is unchanged here; production release proof
is deployment identity and read-only smoke, not publishing synthetic user content.
