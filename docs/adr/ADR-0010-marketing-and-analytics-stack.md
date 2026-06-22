# ADR-0010 — Marketing & Analytics Stack

- **Status:** Accepted — 2026-06-23 — **with a hard dependency on the open legal review** (see below)
- **Deciders:** Founder (operator)
- **Related:** open gap #1 (product analytics for H1/H4/H6), ENTRY_DATA_AND_RANKABILITY §5 (location lock), AI_SEO_SYNTHESIS §B2 (GA4 blind to AI crawlers) / §A5 (Share-of-Model), PRD CHANGE-SET 2026-06-22 + DB_SEED §13 (GDPR / Art. 6 TBD), ADR-0009 (Cloudflare Web Analytics, DNS for email)

## Context & forces

- Two distinct measurement needs that must not be conflated: **(a)** product kill-criteria — H1 `p_journal`, H4 publish-rate, H6 organic-K (the live post-launch validation thesis, open gap #1); **(b)** marketing/ads attribution.
- Binding constraints:
  - **Wartime location privacy:** no precise coordinates in any event, URL, or analytics payload (ENTRY §5; a §3 cross-cutting invariant). The audience includes UA users under military risk.
  - **Public-only + GDPR, Art. 6 legal basis TBD** pending legal review (Bulgaria is in the EU). GA4 / Clarity / Meta Pixel legally require **prior consent** for EU users (ePrivacy + GDPR).
  - **GA4 is blind to AI crawlers** — they do not execute JS, so GA4 systematically under-counts zero-click AI citations. GA4 therefore **cannot be the H6 instrument**, even though H6 rides substantially on AI citation.

## Decision

A **two-axis** stack, separated by trust boundary.

### Axis A — first-party, privacy-safe (PRIORITY; this is open gap #1)
- **PostHog** (self-host or EU Cloud, reverse-proxied under our own domain) — product analytics for **H1 `p_journal`, H4 publish-rate, lineage metrics**, plus **session replay**. Data stays first-party; nothing exfiltrated to third parties; GDPR-cleaner.
- **Cookieless web analytics** — Cloudflare Web Analytics (already in the stack per ADR-0009) or Plausible — for traffic/SEO monitoring **without a consent banner** (cookieless privacy-first analytics generally needs no EU consent).

### Axis B — third-party marketing/ads (operator mandate), consent-gated + server-side
- **Consent gate (CMP) loads FIRST.** No third-party tag fires before opt-in. (Google Consent Mode v2 + a shadcn banner, or Cookiebot/Osano if IAB-TCF compatibility is needed for ad partners.)
- **GTM client + server-side GTM (sGTM).** The browser hits *our* sGTM endpoint (first-party); sGTM forwards to Google/Meta server-side, so we control exactly what egresses (strip location, hash PII).
- **Meta — Conversions API (server-side)** over a raw Pixel. If a client Pixel remains, it is consent-gated + minimal-data.
- **Google Ads + GA4** via sGTM + Consent Mode v2 + Enhanced Conversions (server-side). **GA4 = marketing/human-web tool only — NOT a kill-criteria instrument, NOT H6.**

### SEO / AI-visibility instruments (these measure the actual growth thesis)
- **Google Search Console** — free, must-have (ranking queries, indexation, Core Web Vitals). More valuable than GA4 for the SEO thesis.
- **Bing Webmaster Tools + IndexNow** — ChatGPT search rides the Bing index (Bing → ChatGPT path).
- **Share-of-Model / AI-visibility monitoring** (Otterly/Profound, or our own 60–100 prompt runs per AI_SEO_SYNTHESIS §A5) — **the real H6 instrument** GA4 cannot be.
- **First-party UTM attribution** captured server-side into PostHog (own the attribution; ad-blockers cut third-party pixels).
- **Pinterest (organic + ads)** — gardening is visual; a strong, under-rated organic+paid channel for this niche. Same consent/server-side caveat. Candidate for wave-1.

## Superseded within this ADR

- **Microsoft Clarity dropped** in favor of **PostHog session replay** — avoids adding Microsoft as another processor over a war-sensitive audience; one first-party tool instead of two.

## Alternatives considered

- **GA4 / Firebase Analytics as the product-analytics tool.** Rejected: client-side + sampled (bad for precise product metrics), leaks war-sensitive UA behavior to Google, and is blind to AI citations — it cannot serve the kill-criteria.
- **Cloudflare Web Analytics as product analytics.** Rejected: page-view analytics, not product events; does not measure `p_journal`.

## Consequences

- **Good:** first-party product analytics owns the kill-criteria data under the privacy constraints; server-side marketing keeps output control + ad-blocker resilience; SEO/AI-visibility instruments actually match the H6 thesis.
- **Disliked / costs (named honestly):**
  - **Consent is mandatory for the EU and is a HARD DEPENDENCY on the open legal review** — DPAs with Google/Microsoft/Meta, a privacy policy with disclosure, and EU-US Data Privacy Framework status verification. *DPF is legally contested/moving — verify its status at launch, do not assume.*
  - **Meta for UA-under-war-risk is the most aggressive item** on the list (largest GDPR-enforcement history + wartime sensitivity). A deliberate operator decision, with CAPI + data-minimization as de-risk — not a default.
  - **Tag bloat hurts SSR Core Web Vitals** (Google measures it). sGTM + consent-gate + cookieless-first mitigate; replay (the heaviest tag) is PostHog, not an added Clarity.

## Verification owed (before any third-party tag goes live)

- **Legal review sign-off** on the Art. 6 basis + DPF status. This gates Axis B entirely. Axis A (first-party) can proceed in parallel under the same DPA/privacy-policy work.
