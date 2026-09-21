# OverGarden product design audit — 21 September 2026

**Status:** review and redesign brief; no application changes, production mutations, or Linear tasks. This is a product-wide expert audit with explicit coverage limits, not a WCAG conformance certificate or a completed usability study.

**Repository baseline:** `e554aec506e84ec6f8304c4704084671ed19f399`. Production was inspected independently in the in-app browser and in the owner's authorized Chrome session. Production/deployment SHA equivalence was not established. Code citations refer to this local baseline.

[Open the interactive findings viewer](index.html) — search and filter the 45 findings by priority.

## Read in this order

1. [Findings and priorities](FINDINGS.md): stable finding IDs, evidence, impact, recommendations and acceptance criteria.
2. [Information architecture and visual direction](REDESIGN_BRIEF.md): page responsibilities, centered shell, Threads style, component contracts.
3. [Fast entry creation across many spaces and objects](FAST_ENTRY.md): the primary product journey and its edge cases.
4. [Accessibility review and verification plan](ACCESSIBILITY.md): confirmed defects versus untested requirements.
5. [Coverage and evidence](COVERAGE.md): inspected journeys, source-only areas, limitations, screenshots.
6. [Reference research](REFERENCES.md): observed Mobbin examples and what transfers to OverGarden.
7. [Sequencing and future Linear handoff](HANDOFF.md): dependencies, measurable outcomes, task boundaries. No Linear issues were created.
8. [Route inventory](ROUTES.md): every page.tsx at the audited baseline, including wrappers and retired-path handlers.

## Executive assessment

The main defect is the product's task structure. A common shell and consistent tokens now exist, but they wrap pages that combine too many different jobs. The most important recurring job—recording an observation in an existing space or object—is subordinated to onboarding, catalogue identity, dashboards and metadata. The global New entry control leads to an add-object form; that form offers only one existing space. This does not scale to the owner's explicitly stated multi-space, multi-object use case.

A second urgent problem is trust: public help, privacy and first-publication text still describe private-first entries, server-cleaned originals, delayed indexability and archiving. Those statements conflict with the current public-only, browser-WebP, publish-only product contract. A visual redesign must not preserve them.

The desktop has three columns, but the left and right rails are attached to the viewport edges around a separately centered reading column. This is materially different from the owner's requested vc.ru structure: **the entire three-column composition must be centered as one bounded group**.

## Owner decisions captured in this conversation

- Threads (Meta) is the **primary visual/style reference**, including quiet surfaces, compact author-first posts, social actions and focused composition.
- vc.ru is the **desktop layout reference**: three columns inside one centered container.
- Airbnb is a supporting reference for search/filter clarity, readable cards and progressive disclosure—not an equal competing visual system.
- Fast publishing into **any existing owned space or object** is the highest-priority journey. There can be many of each, not one.
- Use Mobbin evidence in the redesign work. References are documented with canonical links and observed patterns.
- Audit now; detailed Linear tasks follow later. No subagents were used.

These decisions supersede older reference preferences for purposes of this audit brief. Implementation must reconcile ADR-0031 D3/D4 and DESIGN.md explicitly. This report does not silently amend those governing files. ADR-0028's rich document model need not be removed to provide a simpler default composer.

## Preserve these strengths

Public reading works without requiring an account; a real domain model connects entries, objects and organisms; many controls have useful accessible names; command search supports keyboard use; mobile navigation includes creation; publication is explicit; empty states offer onward paths; source failures can remain local to a section; photographs have reserved geometry; addresses and document contracts have clear rules. Rebuild task composition on top of these foundations.

## Evidence limits

Production was inspected read-only. No posts, likes, follows, memberships, settings, uploads, deletion requests or moderation decisions were submitted. Therefore publish success, failed-upload recovery, destructive confirmations, first-time consent completion and post-auth restoration remain release-proof requirements. The owner account is not a representative ordinary member account. BG and RU screens dominate live evidence; Ukrainian content and source strings were inspected, but a complete three-locale parity pass was not performed. Mobile DOM checks were possible, but viewport-override screenshot scaling was inconsistent; those captures are excluded from visual proof. See the coverage ledger for precise gaps.
