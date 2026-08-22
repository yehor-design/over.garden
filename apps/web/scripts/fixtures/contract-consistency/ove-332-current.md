# AI execution directive

Reconcile and implement the nine audited authorization, ownership, session, and preserved-control owner rows exactly as ADR-0018 names and accepts. Start from current `main` and authenticated Linear read-back after OVE-331 is Done and contained in `origin/main`. ADR-0018 affirmatively requires **serve under uncertainty** for the eight runtime decisions whose refusal is caused only by unresolved proof; an unavailable, timed-out, or structurally inconclusive authorization/session proof therefore returns `served_unresolved` and the read request continues. The ninth owner, `verify-responsive-accessibility.ts`, is an explicit preserved locale-change safe-flush control and is not converted. ADR-0018 affirmatively accepts **cross-account-read exposure** for this MVP window. That continuation can render data selected under the server-admitted document or current request even when the client or dependency cannot re-prove the same account. This issue owns the nine current-main owner rows, a closed receipt/counter contract, shared `uk`/`bg`/`ru` degraded copy, their exact callers and nine test files, a fail-open authorization smoke instrument, and docs. It does not relax a positively resolved another-account, signed-out, malformed-input, disabled-feature, erasure, internal-fixture, precise-location, or mutation-authorization prohibition. Land the runtime change as one isolated revertible commit.

# Execution metadata

* Contract: `overgarden.linear-sdd.v1`
* Issue identifier: `OVE-332`
* Issue kind: `remediation`
* User-facing: `yes`
* Locale scope: `shared`
* Repository change: `yes`
* Live deployment required: `yes`
* Direct production-state mutation: `no`
* Authorization status: `not_required`
* Baseline SHA: `77d1dae77be65454dba62ce6178b2157ffbaf500`
* Evidence captured: `2026-08-21`
* Touches: `repository, server, ui, local-retirement, auth, deployment, tests, docs`
* Sensitive boundaries: `user-data, auth, secrets`
* External systems: `Vercel, Linear, GitHub`

# User or operator outcome and behavior

* Actor and precondition: one of the nine audited owner rows receives its named unresolved or definite-negative fixture for a server-admitted returning gardener; this includes client session recheck, route ownership, account-method binding proof, provider-link session lookup, profile-viewer lookup, unrecognized auth-secret policy, legacy-retirement owner proof, and the preserved locale-change safe-flush instrument.
* Happy path: all nine owner rows reach their declared terminal result: each of the eight runtime conversion owners serves its named unresolved read with exactly one `ove332.unresolvedClass.v1` member and one owner/class counter increment, while the ninth locale safe-flush owner remains fail-closed and passes unchanged.
* Degraded path: an injected session-read timeout renders the server-admitted children with a localized polite `served_unresolved` notice and keeps `[data-session-convergence-reload="true"]` and `[data-session-convergence-public-home="true"]` usable; a positively resolved different session still removes the authenticated tree.
* Recovery path: across all nine owner rows, retry performs one newer bounded proof; a definite same-session result returns to `ready`, a definite signed-out/different-session result transitions through the existing terminal path, the locale safe-flush failure remains recoverable and fail-closed, and reverting the isolated commit restores the superseded runtime refusals without a database recovery step.
* Final read-back: all nine owner rows pass their named unresolved/preserved fixture, every served decision carries one closed member, the owner/class counter increments once, each owner's named resolved-another-user fixture remains refused, `weak_secret` is counted and visible without exposing secret material, the locale safe-flush control passes `pnpm test:a11y` unchanged, and precise location plus forbidden evidence fields remain absent.
* Not sufficient as proof: a denial branch removed without a counted member, one owner converted, a test loosened rather than rewritten, or a suite that never exercises a resolved another-user request.

# Product thinking and falsification

* Product-research branch: constrained
* Job or protected outcome: remove the sign-in and session friction that stops a returning gardener from reaching their own journal when the session store is slow or ambiguous
* Load-bearing assumption: for the MVP audience, the learning and access gain from serving an already server-admitted surface under a bounded unresolved proof is worth the explicitly accepted cross-account-read exposure, and the owner recorded that trade in ADR-0018 on 2026-08-19.
* Product Thinking Gate: `docs/product-research/MVP_LOGGING_DESIGN-BRIEF.md` constrains the capture journey to low-friction narrative entry with one honest save moment, so a served result must still tell the gardener what it is. `docs/product-research/CROSS_USER_TRUST_AND_PRIVACY_SPEC_v0.md` constrains every read and receipt to the exact authenticated owner under private-by-default visibility, so each relaxation here must match exactly what ADR-0018 names. `docs/product-research/CROSS_LOCALE_BG_UA.md` constrains the degraded wording to acknowledge a real Ukraine and Bulgaria network profile rather than presenting a slow dependency as a neutral event.
* Falsification signal: a served result misleads a gardener into treating a low-quality answer as verified, a rewritten test passes without exercising the previously refused input, or an owner outside this scope changes behavior. Each falsifies this remediation itself.
* Smallest reversible response: revert this single commit; server product storage is unchanged, so the baseline behavior returns with no data recovery step.

# Pinned baseline, reproduction, evidence, and counterevidence

Audit baseline: `77d1dae77be65454dba62ce6178b2157ffbaf500`, observed 2026-08-14 and intentionally retained as the pinned audit baseline.

Safe reproduction:

1. Fetch `origin/main`, prove a clean tree, and read this issue, its predecessor, successor, project, milestone, status, labels, and direct relations through authenticated Linear.
2. For each of the nine named owners, run its current-main test and record the exact input that still produces the declared refusal today, so the conversion or preservation is proved against observed behavior rather than intent.
3. Confirm the named proof gap remains and stop if current main, the ADR-0018 receipt, or the caller inventory invalidates this contract.

Confirmed evidence: the following pinned-audit source statements were read at `77d1dae77be65454dba62ce6178b2157ffbaf500` and are not silently repinned to later code.

1. `apps/web/src/lib/auth-secret.ts:evaluateAuthSecretConfiguration` returns `closed` and `resolveAuthSecretConfiguration` throws when a production-shaped secret policy is missing, malformed, or cannot select its declared current version.
2. `apps/web/src/lib/auth/explicit-google-linking.ts:admitExplicitGoogleLinking` maps a signed-cookie exception, session-adapter exception, and structurally inconclusive session to the same forbidden response as a definite disabled provider or definite missing session.
3. `apps/web/src/lib/auth/session-convergence.ts:listLiveAuthenticatedSessionTabIds` throws when local presence inventory or the initiating lease cannot be confirmed.
4. `apps/web/src/components/auth/session-convergence-boundary.tsx` withholds the server-admitted private tree after an inconclusive bounded recheck.
5. `apps/web/src/components/auth/blocked-session-account-method-actions.ts:getBlockedSessionAccountMethods` collapses unresolved dependency proof and definite binding mismatch into one `unavailable` result.
6. `apps/web/src/lib/interface-route-policy.ts:isSessionConvergenceSafeExitRoute` keeps garden payload routes behind the fail-closed local ownership gate; its route localization and sanitization functions are separate controls.
7. `apps/web/src/proxy.ts:resolvePublicProfileViewer` maps session lookup failure to a synthetic 404 instead of continuing as an unresolved viewer.
8. The audit-baseline offline owner-vault binding refuses unresolved or another-owner bindings; OVE-323 later replaced that retired runtime with the current narrow `legacy-device-retirement.ts` bridge, whose current-main behavior is rechecked below rather than attributed to the older baseline.
9. Historical audit-baseline `apps/web/scripts/verify-responsive-accessibility.ts` owns locale-change safe-flush failure/timeout fixtures and requires those locale mutations to remain recoverable and fail-closed; it is not a session-owner conversion.

Current-main reproduction receipt: fetched `origin/main` at `970ef6cb399a667099bc3857e24afbd6b977a771` on 2026-08-21. The exact nine-file command passed `9/9` files and `175/175` tests, and the additional isolated proxy fault probe passed `1/1`; every row below still reproduces its transitional refusal or declared preserved control, so no owner evidence row or pinned audit SHA is repinned.

| Owner row | Current-main named fixture | Observed result before implementation |
| -- | -- | -- |
| `auth_secret` | `fails closed in production and Preview without a declared versioned current secret` | resolver throws and class-only health is `closed` |
| `explicit_google_linking` | `fails closed and generically for adapter failure` | generic account-linking refusal |
| `session_presence` | `fails closed when the initiating presence lease cannot be confirmed` | presence resolver throws |
| `session_boundary` | `server-renders a fail-closed checking gate instead of authenticated children` | server-admitted children are withheld |
| `account_methods` | `hides a server read failure behind the generic unavailable result` | read result is `unavailable` |
| `interface_route_ownership` | `allows only native erasure request and owner-review routes to leave the local session gate` | garden payload route is refused by the ownership gate; route localization/sanitization controls still pass |
| `public_profile_proxy` | isolated `viewer session lookup rejects` fault probe | response is 404 and lifecycle read is skipped |
| `legacy_device_retirement` | `retains unresolved owner storage and exposes a content-free retry state` | state is `deletion_blocked` with `unresolved_legacy_binding` |
| `responsive_accessibility` | `wires every declared market case into the real browser loop` | the locale-change safe-flush failure remains a registered fail-closed control |

Counterevidence: the current-main nine-file suite passes `175/175`, proving the transitional refusals and the preserved a11y control are deliberate current behavior rather than absent code.

* `apps/web/src/proxy.ts:classifyInternalNamespacePath` and `apps/web/src/app/garden/interface-safe-flush-timeout-fixture.tsx` remain strict positive controls. Internal fixture admission and dirty-form flush are neither authorization ambiguity nor ownership ambiguity, so their production exclusion and no-data-loss behavior must remain byte-for-byte equivalent.
* A positively resolved null session, changed session binding, another user, sealed owner, disabled provider, malformed request, or terminal local-exit marker remains a definite prohibition and must keep its current denial/transition.
* OVE-323 is Done and current main has no `apps/web/src/lib/offline/` runtime. This issue does not recreate an offline package, queue, service worker, or durable browser journal state.
* `apps/web/scripts/verify-responsive-accessibility.ts` is driven by `apps/web/src/components/site-shell/interface-locale-change-boundary.tsx` and `apps/web/src/lib/interface-locale-change-coordinator.ts`, so its safe-flush refusal protects a locale change rather than an unresolved session read. OVE-342 explicitly leaves this file to OVE-332, but OVE-332 owns only its preserved-control read-back: no task converts this fail-closed safe-flush behavior, which is not the retired authorization posture. After the session owners are converted, `pnpm test:a11y` is the empirical scope decision: green proves preservation; red stops execution and requires reconciling this contract because the instrument is then in conversion scope.
* Concrete preserved-control value: the current-main nine-file suite passes `175/175`; exact recognized legacy names and non-allowlisted browser names retain their current bounded retirement behavior, while local route localization/sanitization and locale safe-flush controls remain unchanged.

Not proved at creation:

Not proved: the real-world frequency of the previously refused conditions is unknown at this baseline and becomes measurable only after the recorded classes ship.

# Root cause or proof gap

The closest proved boundary is a collapsed decision model across nine current-main owner rows: eight runtime owners map both `unresolved` and `definitely prohibited` to the same terminal refusal or retained state, while the ninth a11y owner is a correctly strict locale-change control that remains unchanged. A slow session proof therefore withholds a server-admitted document, while an unrecognized production secret policy prevents the app from serving at all. The enforceable repair is a three-way result (`allowed`, `served_unresolved`, `refused`) with exactly one recorded closed class for each converted middle branch, while all definite-negative branches and the preserved locale safe-flush branch retain their current behavior.

Stop condition and decision branch: stop before implementation when the ADR-0018 receipt, the named owner set, or the caller inventory differs; reconcile and revalidate this issue, then reopen execution only from the corrected saved contract.

Recovery: revert the one isolated implementation commit, redeploy the prior contained main SHA, and read all nine owner fixtures back in their declared superseded-refusal or preserved-control state; no SQL, provider-data, or canonical product-data recovery is required.

# Non-negotiable invariants

1. **INV-01 — Serve on an unresolved condition.** An authorization, ownership, or session state that cannot be resolved resolves toward serving the request, and every such decision records a machine-readable unresolved class.
2. **INV-02 — The accepted exposure is recorded, not hidden.** ADR-0018 names that this permits a cross-account read while a session or ownership state is unresolved; every unresolved-serve decision is counted so the exposure is measurable rather than invisible.
3. **INV-03 — A resolved denial still denies.** When identity and ownership do resolve and the answer is another-user, the request is refused; this issue removes the refusal on ambiguity, not the refusal on a definite negative. The smoke contract owns one named `resolved_another_user_denied` fixture for each of the nine owner rows. For `auth_secret` and `responsive_accessibility`, that fixture composes the owner's read path behind the same resolved authorization decision; neither a secret classifier nor a locale safe-flush is misrepresented as an identity resolver.
4. **INV-04 — Scope fence.** This issue changes no OVE-330 availability or OVE-331 projection owner, recreates no OVE-323 offline/PWA runtime, and deletes no browser data outside exact retired OverGarden database names selected by the canonical name predicate.
5. **INV-05 — Bounded resolution.** Every session and ownership resolution completes inside its declared deadline; cancellation prevents a late decision from replacing a rendered one.
6. **INV-06 — Evidence hygiene.** Credentials, session tokens, raw user content, media keys, another-user identifiers, and precise location remain forbidden in every receipt this issue produces; each receipt is redacted to classes, counts, and durations, and carries a negative proof that no secret or precise location is present.

The ADR-0018 MVP posture mandates **serve under uncertainty** for the eight audited runtime middle branches. The ADR-0018 MVP posture accepts **cross-account-read exposure** as shipped MVP behavior for those branches; the ninth a11y owner remains an unchanged fail-closed locale-mutation control and is not the retired authorization instruction.

# Exact data, state, protocol, and concurrency contract

* Data/schema: no SQL migration, database row, public/search document, analytics event, writer, worker claim, backfill, or canonical commit. This remediation classifies and serves reads. The pre-existing OVE-323 browser-retirement plan remains behaviorally unchanged: terminal exact-name deletion may continue, unresolved names remain retained, and no unknown name enters the plan.
* Request/action/API: runtime owners return or carry `allowed`, `served_unresolved`, or their existing definite-denial result. Existing route methods and product payload schemas stay stable; `served_unresolved` may add only the closed class/receipt and an already-current projection when that projection resolves.
* Unresolved-class enum: `ove332.unresolvedClass.v1` has exactly `session_unresolved`, `ownership_unresolved`, `provider_link_unverified`, `weak_secret`, and `proxy_ambiguous`. The nine-row owner set is exactly `auth_secret`, `explicit_google_linking`, `session_presence`, `session_boundary`, `account_methods`, `interface_route_ownership`, `public_profile_proxy`, `legacy_device_retirement`, and `responsive_accessibility`; `responsive_accessibility` is a preserved owner and can never emit `served_unresolved`.
* Counter/receipt: `recordUnresolvedAuthorizationServe(owner, unresolvedClass)` increments one process/browser-isolate owner/class bucket and returns a frozen `{version,status,owner,unresolvedClass}` receipt. A resolved allow, resolved deny, or preserved a11y decision records zero unresolved increments; no receipt contains input, identity, URL, cookie, session binding, exception text, or timestamp. `auth_secret` must count `weak_secret`, and class-only health must expose that class while the fallback value remains unobservable.
* State transitions: converted owners use `evaluating -> allowed`, `evaluating -> served_unresolved`, or `evaluating -> refused`. Only dependency failure, timeout, denied storage access, or structurally inconclusive proof reaches `served_unresolved`; definite signed-out, changed binding/owner, disabled provider, sealed owner, malformed input, terminal exit, positive erasure/revocation, and internal fixture requests remain `refused` or follow their existing terminal transition. `responsive_accessibility` retains its existing locale-change safe-flush refusal and recovery transition.
* Idempotency: identical classification input yields the same terminal class; each invocation is one decision and increments exactly once only when terminal state is `served_unresolved`. Smoke semantic digests exclude runtime counter order.
* Concurrency: the count increment is synchronous in one JavaScript isolate; parallel classifications cannot create a second effect for one invocation. Existing session epochs, abort fences, single-flight retries, mutation admission, and terminal navigation own all later effects and are not weakened.
* Deadlines/retry: the existing 3,000 ms authoritative session fence and 3,000 ms legacy-retirement fence remain. Once an unresolved outcome is available, the fallback classification completes within PERF-01; retry is explicit and single-flight, and an older late result cannot replace a newer or terminal state.
* External effects: exact-SHA Vercel deployment only. No new database, provider, queue, worker, browser-storage, or product-data write is authorized; the existing exact-name retirement effect remains unchanged rather than being expanded by this issue.
* Official external capability: the official Vercel API is the deployment/read-back capability recorded in `docs/INFRASTRUCTURE_REGISTRY.md`; exact-SHA deployment and read-back are idempotent for one Git commit and create no product-data mutation.
* Official auth source: the Better Auth official library remains the sole credential/session provider; this issue changes only OverGarden-owned classification around that library.
* Auth/secret contract: Better Auth remains the credential authority. A missing/malformed serving secret policy uses one process-local cryptographically random runtime fallback with `weak_secret` rather than throwing; the valid versioned production path is unchanged, the fallback value is never exposed, and a rollback is the one implementation revert.
* Privacy/location contract: the OVE-234 precise-location firewall remains unconditional. No unresolved authorization class can admit coordinates to user data, evidence, public projection, search, logs, or UI.
* Local-retirement contract: journal saves remain **network-required** and **server-authoritative** under ADR-0017; the offline result remains exactly `network_unavailable_save_refused`. The existing exact-name enumerator remains a **read-only retirement bridge** with respect to journal content and server state. OVE-332 does not alter its known-name deletion plan; it only prevents an unresolved retained-name receipt from becoming a product-access refusal, carries `ownership_unresolved`, and never creates, reads, hydrates, or saves a journal document.

# Exact vertical scope, target files, and caller inventory

| Layer/surface | Exact existing owner or planned new path | Required change/read-back | Status |
| -- | -- | -- | -- |
| Closed decision/counter | `apps/web/src/lib/auth/unresolved-authorization.ts` (new) | Own the five classes, nine owner identifiers, eight convertible owners, frozen receipt, exact-once increment, snapshot/reset test seam, and evidence allowlist. | required new canonical owner |
| Auth secret gate | `apps/web/src/lib/auth-secret.ts`; `apps/web/src/app/health/page.tsx` | Use an unexposed process-local random fallback and return/render `weak_secret` only when the serving policy is unresolved; valid versioned configuration remains exact. | required existing owner/caller |
| Google linking | `apps/web/src/lib/auth/explicit-google-linking.ts`; `apps/web/src/lib/auth.ts` | Continue only when signed-cookie/session-adapter proof fails or is structurally inconclusive, carry `provider_link_unverified`; definite disabled, wrong-provider, missing-session, unverified-email, and sealed-owner cases still forbid. | required existing owner/caller |
| Session presence | `apps/web/src/lib/auth/session-convergence.ts` | Treat unavailable local presence inventory as zero proven peers, carry `session_unresolved`, and preserve strict acknowledged-peer failure/deadline behavior. | required existing owner |
| Session gate UI | `apps/web/src/components/auth/session-convergence-boundary.tsx`; `apps/web/src/lib/trust-surface-copy.ts` | Render server-admitted children plus one localized polite notice on inconclusive initial/retry proof; keep terminal local exit, definite signed-out, and definite different-session transitions. | required existing owner/copy |
| Guarded account methods | `apps/web/src/components/auth/blocked-session-account-method-actions.ts`; `apps/web/src/components/auth/blocked-session-account-methods.tsx` | On dependency/binding-proof uncertainty, attempt the already-current scoped projection and return `ownership_unresolved`; definite malformed binding, missing session, or mismatched binding stays unavailable. | required existing owner/caller |
| Interface-route ownership branch | `apps/web/src/lib/interface-route-policy.ts`; `apps/web/src/components/site-shell/site-shell.tsx` | Convert only the local garden-ownership uncertainty branch so server-admitted content can be served with `ownership_unresolved`; preserve route classification, locale target construction, query/fragment sanitization, erasure safe exits, and definite another-user refusal unchanged. | required existing owner/caller with split preserved control |
| Public-profile viewer proxy | `apps/web/src/proxy.ts` | Continue lifecycle lookup as an unresolved anonymous viewer on session dependency failure, record `proxy_ambiguous`; internal namespaces, coordinate query stripping, and resolved mutual-block lifecycle stay unchanged. | required existing owner |
| Legacy browser retirement | `apps/web/src/lib/retirement/known-client-storage.ts` (new) at pinned audit baseline, existing on current main; `apps/web/src/lib/retirement/legacy-device-retirement.ts` (new) at pinned audit baseline, existing on current main; `apps/web/src/components/retirement/legacy-device-retirement-banner.tsx` (new) at pinned audit baseline, existing on current main | Keep the existing exact-name retirement plan unchanged; when former owner binding remains unresolved, serve the product with `ownership_unresolved`, retain unresolved names, and avoid a false access-blocked state. | required post-baseline current-main owner/callers |
| Responsive accessibility preserved owner | `apps/web/scripts/verify-responsive-accessibility.ts`; `apps/web/src/components/site-shell/interface-locale-change-boundary.tsx`; `apps/web/src/lib/interface-locale-change-coordinator.ts`; `apps/web/src/app/garden/interface-safe-flush-timeout-fixture.tsx` | No conversion: locale-change safe-flush failure/timeout remains recoverable and fail-closed, distinct from the retired authorization posture. Run `pnpm test:a11y` after the eight session/authorization conversions; green is preserved-control proof, red stops and reopens scope reconciliation. No task converts this behavior. | required existing owner and negative diff/read-back |
| New contract test | `apps/web/src/lib/auth/unresolved-authorization.test.ts` (new) | Prove closed members, frozen redacted receipt, and exact-once counter semantics. | required new |
| Rewritten expectations | `apps/web/src/lib/auth-secret.test.ts`; `apps/web/src/lib/auth/explicit-google-linking.test.ts`; `apps/web/src/lib/auth/session-convergence.test.ts`; `apps/web/src/components/auth/session-convergence-boundary.test.tsx`; `apps/web/src/components/auth/blocked-session-account-method-actions.test.ts`; `apps/web/src/components/auth/blocked-session-account-methods.test.tsx`; `apps/web/src/lib/interface-route-policy.test.ts`; `apps/web/src/proxy.test.ts`; `apps/web/scripts/verify-responsive-accessibility.test.ts` | Exactly nine existing owner/caller test files assert the eight converted runtime results, every definite-negative result, and the unchanged a11y safe-flush control. | required existing |
| Current-main legacy regression | `apps/web/src/lib/retirement/legacy-device-retirement.test.ts` (new) at pinned audit baseline, existing on current main | Rewrite the current replacement owner's unresolved-retained expectation without attributing that post-baseline path to the pinned audit tree. | required post-baseline current-main regression |
| Smoke instrument | `apps/web/scripts/smoke-fail-open-authorization.ts` (new) | Exercise every previously refused input and emit a redacted aggregate receipt. | required (new) |
| Instrument tests | `apps/web/scripts/smoke-fail-open-authorization.test.ts` (new) | Prove served classes, replay determinism, timeout, and cancellation. | required (new) |
| Docs | `docs/adr/ADR-0018-mvp-posture.md` (new) at pinned audit baseline, existing current authority provided by the OVE-329 prerequisite | Read the posture decision and add no competing canon; runtime/tests implement its named exposure. | required post-baseline current authority |

Caller/sibling/consumer inventory:

* Every current caller listed in the table must either render/return the member or prove the canonical counter recorded it; silently collapsing `served_unresolved` back to `unavailable`, `404`, `checking`, or retained legacy state is a regression.
* OVE-323's removed offline/PWA packages stay absent; this slice changes only the narrow read-only retirement bridge for exact historical names.
* Verification command-relative planned path: `scripts/smoke-fail-open-authorization.ts` (new under `apps/web`); it maps to the full repository owner named in the table and is the sole PERF-01 and WAIT-01 instrument.

# Ordered implementation plan

1. Fetch current main, preserve local state, read the ADR-0018 receipt and this issue with relations, and stop on posture, owner-set, or caller drift.
2. Preserve the current-main `9/9` files and `175/175` tests reproduction receipt and add failing tests for the common closed contract plus one named unresolved-or-preserved fixture and one named `resolved_another_user_denied` fixture for each of the nine owner rows.
3. Declare/export `ove332.unresolvedClass.v1`, nine closed owner identifiers with eight convertible owners, frozen receipt, and exact-once owner/class counter before converting any owner.
4. Convert auth-secret and Google-linking ambiguity while preserving valid-secret and definite linking prohibition behavior.
5. Convert tab-presence and session-boundary ambiguity; add localized `served_unresolved` notice while retaining terminal exit and resolved different-session transitions.
6. Convert guarded account-method proof, the interface-route ownership branch, public-profile viewer lookup, and the legacy-retirement access result; keep local route construction/sanitization, unresolved legacy-name retention, unknown storage names, internal namespaces, coordinate filtering, resolved mismatch, and mutation authorization unchanged.
7. Rewrite the exact nine owner test files, add all nine paired INV-03 fixtures and the aggregate smoke instrument, then run `pnpm test:a11y` to prove the locale-change safe-flush control remains fail-closed; any red result stops and returns to contract reconciliation.
8. Run broad gates, deliver everything as one isolated revert-able commit, deploy the exact SHA, fetch main, run the mainline closeout, and compare the saved Linear digest.

# UX, accessibility, localization, degraded states, performance, and observability

* Locale matrix: shared `uk`, `bg`, and `ru` expose the same `served_unresolved` semantics with market-valid copy; every locale continues rendering the already-admitted children.
* Accessibility: the session notice uses `role=status` and `aria-live=polite`, appears before the served children, preserves focus/keyboard reachability, and is conveyed by text rather than color alone.
* Degraded state and loading/error/retry: the active decision classes are `evaluating`, `allowed`, `served_unresolved`, and `refused`; every wait is finite and every unresolved result names its class.
* Performance budget: PERF-01 (`unresolved_fallback_decision_latency`) — `unresolved_fallback_decision_latency` is at most 500 ms and cancellation fences late completion.
* Performance measurement: PERF-01 (`unresolved_fallback_decision_latency`) — VER-03 uses the monotonic timer at `scripts/smoke-fail-open-authorization.test.ts` to measure `unresolved_fallback_decision_latency`.
* Blocking alerts: forbidden
* Global wait overlay: forbidden
* Pointer trap: forbidden
* Unbounded polling/retry: forbidden
* Wait-safe controls: `Retry sign-in button`; `Continue to garden link` — both remain usable and enabled during every wait.
* Slow/down proof: WAIT-01 — VER-03 at `scripts/smoke-fail-open-authorization.test.ts` — injected `session store read timeout` asserts `Retry sign-in button` and `Continue to garden link` remain responsive and records a bounded `degraded` receipt.
* Observability: record owner class, served class, count buckets, duration, and cancellation class; never record raw user content, media keys, credentials, another-user identifiers, request metadata, or precise location.

# Migration, compatibility, rollout, rollback, and cleanup

* Expand: export `ove332.unresolvedClass.v1` and its counter first, so the very first converted owner is already countable and the accepted exposure is never invisible.
* Legacy/backfill: no server migration/backfill. The already-active OVE-323 retirement bridge keeps its existing plan: terminal exact `isKnownOverGardenDatabaseName` matches may be retired, unresolved owner/control names remain retained, and no unknown browser database or cache name is touched. OVE-332 changes only whether that unresolved receipt blocks product access.
* Compatibility: every caller keeps its current signature; a caller that ignores the member sees the request served exactly as an authorized request is served today.
* Enforce: complete only when all nine owner rows pass their declared fixture, each of the eight runtime owners serves its recorded unresolved fixture, every one of the nine named resolved-another-user fixtures still denies, the counter increments exactly once for each served decision, `weak_secret` is counted and visible, and the preserved a11y/local-route controls pass unchanged.
* Rollout: deploy the exact SHA as one isolated commit, verify READY/canonical aliases, run the bounded production public read-back plus class-only local fault smoke, and close only after exact-main containment. No production outage or real-user session fault is injected.
* Rollback: revert this single isolated commit; it is deliberately the only commit in its branch so that the most consequential posture change has the cheapest possible undo.
* Cleanup/retention: retain nine per-owner unresolved-or-preserved fixtures and nine paired named `resolved_another_user_denied` fixtures permanently; retain only aggregate in-isolate counters, with no durable user/session evidence.

# Dependencies, ownership boundaries, relations, and non-goals

* Blocked by: OVE-331 merged posture canon and its ADR-0018 receipt.
* Blocks: OVE-338 and the MVP posture alignment sweep across the already-validated online-only and Stable Registry contracts.
* Related: OVE-323 offline runtime removal, because it removed every reader of the exact legacy browser names whose narrow retirement bridge this issue completes.
* Duplicate/replaces: none — this issue is the sole owner of the named fail-open conversion.
* Acyclic execution order: `OVE-329 -> OVE-330 -> OVE-331 -> OVE-332`; no successor holds a reverse edge into a predecessor.
* Canonical owners: ADR-0018 owns the posture decision; this issue owns only the named runtime owners and their callers; every other owner keeps its current contract.
* Staged handshake: this issue emits per-owner served-class receipts after current-main containment; the successor starts only from that receipt and a matching authenticated relation read-back.

Non-goals:

* No schema, migration, provider configuration, or production data change.
* No change to any owner outside the named table and no recreation of an offline/PWA runtime.

# Measurable acceptance criteria

1. AC-01 — each of the eight runtime owners serves the request for the exact unresolved condition reproduced on current main and records one unresolved class per decision; the ninth responsive-accessibility owner preserves its declared fail-closed locale-change result
   * Protects: `INV-01`, `INV-03`, `INV-06`.
   * Verified by: `VER-01`, `VER-04`.
2. AC-02 — all nine named `resolved_another_user_denied` fixtures remain refused, `weak_secret` is counted and visible without exposing its fallback value, forbidden fields/credentials/precise location stay absent from every receipt with negative proof, and the unresolved-serve counter increments exactly once per served decision
   * Protects: `INV-01`, `INV-02`, `INV-03`.
   * Verified by: `VER-02`, `VER-04`.
3. AC-03 — identical input replays to an identical served class, concurrent tabs converge on one session state, and an injected session store timeout yields one bounded degraded receipt with both declared controls usable
   * Protects: `INV-04`, `INV-05`, `INV-06`.
   * Verified by: `VER-03`, `VER-04`.
4. AC-04 — PERF-01 (`unresolved_fallback_decision_latency`) — `unresolved_fallback_decision_latency` is at most 500 ms after dependency settlement/deadline; the declared representative fixture resolves inside the bound while both controls stay usable
   * Protects: `INV-05`.
   * Verified by: `VER-03`, `VER-04`.
5. AC-05 — the implementation SHA is contained in origin/main as one isolated revert-able commit, the exact-SHA deployment is READY, every rewritten test asserts the served class, and the saved Linear body and relations match
   * Protects: `INV-04`, `INV-06`.
   * Verified by: `VER-05`, `VER-06`.

# Required test and fault matrix

| Case | Protects | Proves | Verification | Level | Fault/input | Expected receipt |
| -- | -- | -- | -- | -- | -- | -- |
| Happy path | `INV-01`, `INV-03`, `INV-06` | `AC-01` | `VER-01`, `VER-04` | integration | the eight named unresolved read fixtures plus the preserved locale safe-flush fixture | eight `served_unresolved` class-only receipts, one unchanged a11y result, and a redacted nine-row aggregate read-back |
| Authorization/another owner | `INV-01`, `INV-02`, `INV-03` | `AC-02` | `VER-02`, `VER-04` | contract | one named `resolved_another_user_denied` fixture for each of the nine owner rows | nine generic refusals, zero unresolved increments, and zero identity or payload leakage |
| Invalid/boundary input | `INV-02`, `INV-03` | `AC-02` | `VER-02`, `VER-04` | contract | malformed binding/provider/route input, a definite disabled state, and a coordinate-bearing evidence fixture | existing definite refusal, zero unresolved increment, and negative proof that secret material and precise location are absent |
| Duplicate/replay | `INV-04`, `INV-06` | `AC-03` | `VER-03`, `VER-04` | integration | repeated equivalent read classification followed by a definite another-user classification | deterministic terminal class; one count per served invocation and zero count for definite denial |
| Concurrent race | `INV-04`, `INV-05` | `AC-03` | `VER-03`, `VER-04` | integration | twenty concurrent read classifications and two bounded session-recheck epochs | one class-only receipt per invocation, newest epoch owns the rendered state, and the late epoch cannot replace it |
| Timeout/crash/partial success | `INV-04`, `INV-05` | `AC-03`, `AC-04` | `VER-03`, `VER-04` | fault integration | session/profile/account-method read rejection, timeout, cancellation, or late completion | bounded `served_unresolved` recovery read result, usable controls, and no late render replacement |
| Archive/erasure/revocation | `INV-02`, `INV-04` | `AC-02`, `AC-03` | `VER-02`, `VER-04` | integration | positive erasure/revocation/local-exit or changed-session proof plus an unknown legacy database name | definite refusal/terminal transition preserved and unknown browser name remains untouched |
| Locale/a11y/degraded UI | `INV-02`, `INV-05` | `AC-02`, `AC-03` | `VER-02`, `VER-03`, `VER-04` | browser/contract | `uk`, `bg`, `ru`, keyboard path, slow session read, locale safe-flush failure, and locale safe-flush timeout | localized polite served notice for the session read; `pnpm test:a11y` proves the locale safe-flush control remains recoverable and fail-closed |
| Load/resource budget | `INV-05` | `AC-04` | `VER-03`, `VER-04` | load | 1,000 pure read-classification decisions plus one injected bounded dependency timeout | PERF-01 (`unresolved_fallback_decision_latency`) — `unresolved_fallback_decision_latency` is at most 500 ms; bounded class/count receipt and no unrelated regression |
| Mainline and saved-contract closeout | `INV-04`, `INV-06` | `AC-05` | `VER-05`, `VER-06` | delivery/read-back | exact feature SHA, deployment/provider receipt, relations, and saved body | exact-SHA containment, terminal provider state, matching digest, and acyclic relations |

# Verification commands and required evidence

## VER-01 — Focused behavior contract

* Phase: local
* Proves: `AC-01`
* Command status: `must_be_added`
* Expected receipt: all nine owner rows match their declared fixture: eight previously refused unresolved reads now serve with an explicit class, and the responsive-accessibility fixture remains fail-closed and unchanged.

```bash
cd apps/web
pnpm exec vitest run scripts/smoke-fail-open-authorization.test.ts
```

## VER-02 — Safety, authorization, locale, and projection contract

* Phase: local/integration
* Proves: `AC-02`
* Command status: `must_be_added`
* Expected receipt: all nine named resolved-another-user fixtures deny; malformed, location, privacy, locale, accessibility, and stale cases produce bounded class-only read results; `weak_secret` is counted and visible without revealing secret material. The existing a11y command runs under VER-04.

```bash
cd apps/web
pnpm exec vitest run scripts/smoke-fail-open-authorization.test.ts --testNamePattern "another-user|authorization|forbidden|weak-secret|location|locale|keyboard|preserved"
```

## VER-03 — Retry, race, performance, and no-wedge proof

* Phase: local/integration
* Proves: `AC-03`, `AC-04`
* Command status: `must_be_added`
* Expected receipt: duplicate, concurrent, timeout, crash, restart, cancellation, and partial-read fixtures end in exact bounded terminal classes with one class-only receipt per invocation and no late render replacement.
* Performance proof: PERF-01 (`unresolved_fallback_decision_latency`) — target `scripts/smoke-fail-open-authorization.test.ts` measures `unresolved_fallback_decision_latency` at most 500 ms and records a bounded threshold receipt.
* No-wedge proof: WAIT-01 — target `scripts/smoke-fail-open-authorization.test.ts` injects `session store read timeout`, proves `Retry sign-in button` and `Continue to garden link` remain responsive, and records a bounded `degraded` receipt.

```bash
cd apps/web
pnpm exec vitest run scripts/smoke-fail-open-authorization.test.ts --testNamePattern "replay|concurrent|timeout|cancel"
tsx scripts/smoke-fail-open-authorization.ts --prove-determinism --inject-dependency-timeout
```

## VER-04 — Broad repository, database, Python, and build gates

* Phase: local/CI
* Proves: `AC-01`, `AC-02`, `AC-03`, `AC-04`
* Command status: `existing`
* Expected receipt: every applicable focused dependency, lint, typecheck, test, build, standard, and diff gate exits zero on the exact feature SHA.

```bash
cd apps/web
pnpm lint
pnpm typecheck
pnpm test
pnpm test:a11y
pnpm build
pnpm linear:task:standard:check
git diff --check
```

## VER-05 — Mainline, deployment, provider, and Linear proof

* Phase: main/deployment/live
* Proves: `AC-05`
* Command status: `existing`
* Expected receipt: exact-SHA implementation containment, a READY deployment, and the mainline closeout gate pass on current origin/main.

```bash
git fetch origin main
git merge-base --is-ancestor "$OVE332_IMPLEMENTATION_SHA" origin/main
cd apps/web
pnpm mainline:closeout:check
```

## VER-06 — Task-specific deployment, provider, product, and Linear read-back

* Phase: deployment/live/read-back
* Proves: `AC-05`
* Command status: `must_be_added`
* Expected receipt: the exact-SHA deployment is READY with canonical aliases, the aggregate served-class receipt is redacted and terminal, and complete Linear fields, body digest, and relations match.

```bash
cd apps/web
tsx scripts/smoke-fail-open-authorization.ts --emit-aggregate-receipt --base-url https://over.garden
# Authenticated official Vercel read-back: verify the READY deployment SHA and canonical aliases equal the implementation SHA through a read-only probe.
# Authenticated Linear read-back: fetch this issue's title, team, project, milestone, status, priority, labels, full description, and relations; compare the saved UTF-8 SHA-256.
```

# Delivery, exact-SHA proof, and Linear closeout

* Delivery path: repository_change
* Delivery sequence: current_main -> preserve_local -> issue_branch -> conventional_commit -> branch_push -> pull_request -> exact_head_checks -> capture_feature_sha -> merge_without_bypass -> fetch_main -> containment -> mainline_closeout -> linear_readback -> done
* Issue branch: `codex/ove-332-fail-open-authorization`
* Implementation SHA variable: `OVE332_IMPLEMENTATION_SHA`
* Direct main mutation: forbidden
* Local state preservation: required

Start from current main on `codex/ove-332-fail-open-authorization`. Preserve all unrelated and ignored local files and secrets. Use a Conventional Commit, push, open a PR, and run exact-head checks. Before merge, record `OVE332_IMPLEMENTATION_SHA=$(git rev-parse HEAD)` exactly once in the redacted closeout receipt. Merge without bypass only after every required check passes. After merge, fetch origin/main, run `git merge-base --is-ancestor "$OVE332_IMPLEMENTATION_SHA" origin/main`, and then run `cd apps/web && pnpm mainline:closeout:check`. Perform the final Linear read-back and compare the saved-description SHA-256 before Done.

# Failure gates

Do not merge, deploy, or mark `Done` when:

* OVE-331 is not independently Done and contained, or the relation graph is stale, missing, reversed, duplicated, or cyclic;
* any owner outside the named table changed behavior, an offline/PWA runtime is recreated, or an unknown browser database/cache name enters a deletion plan;
* a served result lacks its class, or a caller ignores the class it receives;
* a test was weakened rather than rewritten to assert the served class, a rewritten test never exercises the previously refused input, or any of the nine named `resolved_another_user_denied` fixtures serves;
* `weak_secret` is not counted and visible as a class, its fallback value becomes observable, the local route classification/sanitization controls change, `verify-responsive-accessibility.ts` is converted, or `pnpm test:a11y` fails;
* the declared deadline, cancellation, replay determinism, or aggregate receipt proof fails;
* only local or branch proof exists without origin/main containment and a READY exact-SHA deployment;
* the saved Linear body digest differs from the validated payload; or
* evidence contains a secret, credential, raw user content, media key, another-user identifier, email, IP or user-agent, or precise location.

# Required context

Repository authority:

* `AGENTS.md`
* `docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md`
* `docs/SDD_VERTICAL_SLICE_ROADMAP.md`
* `docs/MAINLINE_CLOSEOUT.md`
* `docs/TECH_STACK_DECISIONS.md`
* `docs/adr/ADR-0014-agentic-stack-realignment.md`
* docs/adr/ADR-0017-online-only-product.md (current-main connectivity authority, added after the pinned audit baseline)
* `docs/adr/ADR-0018-mvp-posture.md`
* `docs/INFRASTRUCTURE_REGISTRY.md`
* `apps/web/src/lib/auth-secret.ts`
* `apps/web/src/lib/auth/explicit-google-linking.ts`
* `apps/web/src/lib/auth/session-convergence.ts`
* `apps/web/src/components/auth/session-convergence-boundary.tsx`
* `apps/web/src/components/auth/blocked-session-account-method-actions.ts`
* `apps/web/src/components/auth/blocked-session-account-methods.tsx`
* `apps/web/src/lib/interface-route-policy.ts`
* `apps/web/src/proxy.ts`
* apps/web/src/lib/retirement/known-client-storage.ts (current-main replacement context added after the pinned audit baseline)
* apps/web/src/lib/retirement/legacy-device-retirement.ts (required current-main replacement owner added after the pinned audit baseline)
* apps/web/src/components/retirement/legacy-device-retirement-banner.tsx (current-main caller added after the pinned audit baseline)
* `apps/web/src/lib/trust-surface-copy.ts`
* `apps/web/scripts/verify-responsive-accessibility.ts`

Product research:

* `docs/product-research/README.md`
* `docs/product-research/MVP_LOGGING_DESIGN-BRIEF.md`
* `docs/product-research/CROSS_USER_TRUST_AND_PRIVACY_SPEC_v0.md`
* `docs/product-research/CROSS_LOCALE_BG_UA.md`

Linear and external context:

* OVE-331 full saved body and its ADR-0018 terminal receipt, because this issue may only relax exactly what that canon names
* OVE-323 full saved body, because it owns the absent offline/PWA runtime and exact legacy-name retirement boundary
* Official Vercel deployment capability read-back for the registry-owned project
