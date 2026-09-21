# Complete product redesign — execution contract

Owner-authorized direction, 21 September 2026. This is a new redesign program following the audit at `docs/audits/2026-09-21-product-design/`. It supersedes the audit's narrower vc.ru-reference scope and its suggestion to obtain further approval for page regrouping: the owner has explicitly authorized radical layout, IA, page and functional reorganization. It does not rewrite the historical observations.

## Product decisions

- Threads (Meta) is the primary visual language: quiet light surfaces, restrained borders, readable author-first posts, focused text-first composition and consistent social controls. Do not copy dark theme or unsupported features.
- vc.ru supplies the centered three-column desktop group and applicable content patterns: explicit feed modes, topic/community attribution, compact reading previews with expansion, and recognizable conversation entry points. Do not import ads, rankings, monetization or recommendation algorithms merely because they appear in the reference.
- Airbnb supplies progressive creation: one active question, completed answers summarized and editable, clear continuation, back without losing values, optional fields genuinely optional. Apply to creating spaces/objects and discovery filters; never force routine writing into a setup wizard.
- Phosphor is the sole interface icon family across public, member, owner and editor surfaces. Logos, favicons and user photos are not substitute UI icon libraries. Select one documented weight/size grammar and server-compatible narrow imports.
- Thiings is the illustration source/direction. The owner explicitly requests unrestricted selection from the collection, free use, no paid purchases, and no licensing review gate for this redesign. Preserve this instruction verbatim in intent; do not invent a commercial license. The provider's terms observed on this date state free downloads are personal/non-commercial with attribution. This factual discrepancy is recorded here, not introduced as a task blocker. No payment/access bypass or asset-library resale is authorized or needed.
- A space and an owned object are distinct destinations. An organism is a shared reference identity. A journal is a history of entries, not an extra setup entity. One entry has one explicit destination; parent-space aggregation must not duplicate it.
- Primary outcome: repeated acknowledged publication to the intended owned destination, including many spaces and objects. Contextual launch requires one activation; a visible recent destination from global launch requires open plus select. Count typing, photo selection and Publish separately. These are acceptance budgets, not measured user-research results.

## Contracts retained

Read `AGENTS.md`, `PROJECT_STATE.md`, `DESIGN.md` and current ADRs before execution. Journal entries are public/indexable; no durable browser drafts, offline mode or autosave promises. Owner editorial drafts under ADR-0030 are a separate existing capability/plan and remain allowed. Preserve Lexical and JournalDocumentV1, browser WebP/direct upload/atomic publish, Kysely plus SQL, server authorization at mutation time, settled workspace reads and bounded failures, canonical permanent addresses, static public content in served bytes and stable late chrome state. User-facing layout authorization does not authorize destructive schema changes, bulk deletion, secrets, provider changes or unapproved production mutations.

The design canon must be deliberately amended where it conflicts with this direction, including old reference priority, rigid rail dimensions, fixed composer gutter and icon choices. An agent must not retain a known bad hierarchy merely to pass an obsolete visual assertion. Conversely, redesign does not silently override data, identity, public rendering or security contracts.

## Evidence and source hierarchy

1. Current owner decisions and current project contracts.
2. Dated audit: 45 stable OG-UX findings, complete source route inventory, 40 screenshots and raw observations, with explicit coverage limits.
3. Observed reference patterns and clearly labeled design hypotheses.

Read `FINDINGS.md`, relevant screenshot IDs, `FAST_ENTRY.md` and `COVERAGE.md`. The audit did not execute every mutation or perform a fresh complete WCAG/screen-reader/Lighthouse audit. Tasks must supply those missing proofs; do not convert audit recommendations into claims that they are already implemented or proven optimal. A fixture walkthrough is not an interview with gardeners. No numerical conversion/retention lift is established.

## References observed

- Threads author-first feed: https://mobbin.com/screens/b05902e9-b215-47d3-afb7-54346c11af0d — dark example informs hierarchy, not palette.
- Threads light columns: https://mobbin.com/screens/0db0ea31-1837-4a35-98c8-dbb2d460b0e1 — restrained light composition, not a requirement for configurable feeds.
- Threads focused image composition: https://mobbin.com/flows/b38612ad-da22-4755-a575-084a64ec4cc0 — text, small attachment tools, preview/removal and distinct publication.
- Airbnb web Searching homes: https://mobbin.com/flows/4e9f5861-5367-4700-883b-248771553904 — inspected previews 1/4/7/10/13; active Where/When/Who panel with compact completed answers. Month dial, guest counts and map are travel details, not requirements.
- Airbnb iOS Searching homes: https://mobbin.com/flows/0fb29365-f327-46b6-9a6d-2dfbb5589716 — inspected returned preview sequence; collapsed answered sections, active question, clear final action and results.
- Airbnb filters/cards: https://mobbin.com/screens/65e3429b-12dd-45be-a076-b69d47c03124.
- Destination search: https://mobbin.com/screens/f8e60bf2-639b-4edf-9331-294556537eb5 and https://mobbin.com/screens/0df641e3-d047-4712-9479-d491e52d984f — only search/disambiguation mechanics transfer, not a second Notion visual theme.
- vc.ru: https://vc.ru/ — live desktop visual audit evidence in screenshots 08/16; current page text also exposes feed modes, topic attribution, Read fully and conversation entry points. A Mobbin search for vc.ru returned Substack, which is not accepted as vc.ru evidence. Article fetch failed with 503; uninspected detail interactions must be re-inspected by the relevant executor, not claimed verified.
- Phosphor official implementation/license: https://github.com/phosphor-icons/react and https://github.com/phosphor-icons/react/blob/master/LICENSE.
- Thiings: https://www.thiings.co/things and https://www.thiings.co/terms. Illustrations are supporting art; never simulated evidence of a real plant or a second control-icon family.
- Accessibility: https://www.w3.org/WAI/WCAG22/quickref/ ; heuristics: https://www.nngroup.com/articles/ten-usability-heuristics/.

Mobbin archived screens prove that a pattern was present in the inspected example, not that it is the current live screen or universally best. Use canonical links; expiring image URLs do not belong in implementation contracts. Do not redistribute competitor screenshots as product assets.

## Execution and issue boundaries

The project parent is coordination only. It is not an implementation branch. Each child owns a coherent outcome and uses the seven required issue sections. Native Linear blocking relations are execution order authority; numbering is a convenient topological reading order. One branch/PR per issue under current project rules; execute sequentially where shared files overlap. No subagents for this planning request.

Existing open work is reused, not cloned or reopened:

- OVE-467: conversion of remaining public families to static documents. Public redesign tasks consume that architecture. It remains in its existing project and preserves one-family-per-PR scope.
- OVE-468: lazy guest chrome/bundle diet. Shell/icon work must coordinate imports and first-press behavior. Do not run conflicting shell edits concurrently; final convergence verifies both.
- OVE-469: actual production media/network performance. Final redesign release consumes its production acceptance, not a lighter local substitute.
- OVE-381/382/383/384/401/402: planned news/blog entity, lifecycle and mixed-feed backend. New tasks style existing surfaces and specify compatible component contracts without claiming those backend tasks are shipped.
- OVE-406 and its editorial prerequisites own the future agent-block UI and workflow. Consume this redesign's tokens/Phosphor/form patterns when that task runs; do not create a duplicate editorial implementation task or block current-product redesign on the entire pipeline.
- OVE-466 address cleanup and older OVE-186 historical closeout retain their own scopes; neither is recreated by this plan.

Do not reopen completed Slice 28 issues or name Done issue IDs in new PR titles/bodies. They are history, not proof of the newly requested result. No bulk status, assignee or due-date changes are part of planning.

## Common proof contract

Every implementation child must attach a short before/after explanation, exact changed files, state/role/locale fixture evidence, relevant automated output and actual screenshots of its scope. Minimum representative viewports are 320/390/768/1280/1920 CSS px; select all applicable to the change, with integrated full matrix in final proof. Test guest/member/owner where relevant, long UK/BG/RU strings, empty/single/many data, keyboard, zoom, pending/error/retry and back navigation. For public surfaces check canonical links, no-JS served content and static-document gates; for workspace check hard-load failed sections. For mutations verify the acknowledged server outcome, not only a toast.

Register browser specs in the real browser gate. Use meaningful behavior assertions rather than snapshots that only mirror implementation. Keep automated WCAG checks separate from manual screen-reader/contrast/focus/target/reflow evidence. Production actions follow existing approvals; record missing authorization/proof accurately. A child is not Done merely because a mockup, local build or green unit test exists.

The integration ledger maps every finding and every route family to its implementation issue and evidence. Historical audit files stay immutable evidence; this dated addendum defines changed direction. Native dependencies, saved issue text and local manifest must agree after creation.

## Workspace-limit consolidation approved by the owner

Linear rejected creation after 32 executable issues plus the parent. The owner chose to merge related work rather than upgrade. All original 38 work-package requirements remain: Phosphor migration is in OVE-477 foundations; moderation in OVE-500 communities; lineage inboxes/handoffs in OVE-495 passports; owner erasure in OVE-505 privacy. Cross-product consistency, integrated accessibility and release form OVE-478, which executes last. Its former icon work moved into OVE-477; consumers no longer depend on OVE-478. The final task waits on all other 31 implementation issues and OVE-467/468/469. Parent OVE-474 waits on OVE-478 and never blocks its own children. Native readback verified this DAG without cycles.
