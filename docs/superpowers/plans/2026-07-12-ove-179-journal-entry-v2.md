# OVE-179 Journal Entry V2 Implementation Plan

1. Add failing tests for the localized journal presentation contract,
   publication-scoped media/topics/chronology/mentions, separate owner control,
   App Router pages, and document lifecycle proxy.
2. Expand SQL/types and the public journal repository with bounded gallery,
   curated topics, safe mentioned objects, deterministic adjacent entries, and
   related public context.
3. Implement localized presentation/copy and the responsive Shadcn journal
   entry component inside SiteShell; reuse PublicEngagementPanel and OVE-174.
4. Replace the raw route/render modules with root and localized App Router
   pages plus generic hard `404`/`410` lifecycle documents in proxy.
5. Extend the deterministic manifest, seed/reset contracts, fixture index, and
   machine verifier for all required journal archetypes and edge states.
6. Run focused and full automated verification, then complete matched browser
   and screenshot QA against Drive2, exact pre-change OverGarden, desktop, and
   320px states.
7. Commit and push verified changes to `main`, wait for CI and Vercel, run
   canonical live smoke, attach visual evidence and closeout to OVE-179, then
   move the Linear issue to Done.
