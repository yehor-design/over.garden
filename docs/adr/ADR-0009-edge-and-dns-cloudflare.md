# ADR-0009 — Edge & DNS: Cloudflare in front of the stack, GoDaddy as registrar

- **Status:** Accepted — 2026-06-23
- **Deciders:** Founder (operator)
- **Related:** TECH_STACK_DECISIONS §4 (domain facts), AI_SEO_SYNTHESIS §A1/§A2/§B2, ADR-0010 (email DNS records), ADR-0012 (anti-abuse app tier)

## Context & forces

- `over.garden` is a `.garden` gTLD: **not** HSTS-preloaded at the TLD level, so HTTPS is not auto-enforced; the HSTS header must be set explicitly and the domain submitted to the preload list.
- The domain registrar is **GoDaddy**. Registrar (ownership) and DNS hosting are separate roles; the registrar does not have to host DNS.
- The runtime stack is split-managed: Vercel (Next.js app + app backend), Supabase (Postgres + Auth + Storage), Railway (Meilisearch + Python matching service).
- Hard requirements that pull an edge layer:
  - **SEO/crawlability is load-bearing (H6).** Verified search/retrieval bots (OAI-SearchBot, PerplexityBot, Googlebot, …) must reach public pages; any edge layer must *not* block them. (AI_SEO_SYNTHESIS §A1/§A2)
  - **`robots.txt` is not a privacy control.** It is voluntary; grey/new AI crawlers ignore it. The location lock cannot rely on it. (AI_SEO_SYNTHESIS §B2)
  - **Lineage anti-abuse surface** (invite-spam, @-mention abuse, follow) needs a cheap volumetric first layer + a privacy-respecting CAPTCHA on signup/invite.

## Decision

Adopt **Cloudflare** as the edge/security + authoritative-DNS layer in front of the existing stack. **GoDaddy remains the registrar**; delegate nameservers to Cloudflare (full setup — partial/CNAME setup is Business-tier+ and is not needed).

Tiering:
- **Free at launch** — DNS, Universal SSL, L3/4/7 DDoS, **Turnstile** (privacy-respecting CAPTCHA, works independent of proxy mode), HSTS management + preload submission. This layer is genuinely free.
- **Pro ($25/mo per zone) when needed** — the OWASP Core Ruleset (managed WAF) + up to 20 custom WAF rules. Free only gives a basic managed ruleset + crude Bot Fight Mode + 1 IP-only rate-limit rule, which is enough to launch but not to tune.

Configuration invariants (non-negotiable; see also the cross-cutting invariants in the stack doc):
- **SSL mode = Full (Strict).** Vercel serves valid certs; Flexible causes redirect loops.
- **Cloudflare does NOT cache HTML.** Vercel owns the ISR/HTML cache. Do not enable "Cache Everything" for HTML — it would break ISR revalidation and serve stale long-tail pages (the SEO keystone).
- **WAF/bot rules allow-list verified search/retrieval crawlers.** Cloudflare's own docs warn that rate-limiting verified bots can hurt SEO.

## Scope — explicitly NOT adopted now

- **Cloudflare as host (Pages/Workers):** No. Vercel is the first-party Next.js platform; ISR is best supported there, and ISR is the SEO keystone. (Version-sensitive — revisit only if SEO must be pushed to the absolute limit.)
- **Cloudflare R2 for object storage:** Deferred. Tempting (S3-compatible, zero egress, photo-heavy) and portable, but Supabase Storage is bundled with Supabase Auth + Storage RLS. Revisit at scale when image egress cost bites.
- **Cloudflare Images for EXIF stripping:** No. GPS stripping is a privacy invariant and must stay explicit and verifiable in the worker (sharp). Cloudflare may deliver/resize the *already-stripped* derivative only.

## Alternatives considered

- **No edge layer.** Rejected: `robots.txt` cannot enforce the location-privacy posture; no edge anti-abuse; manual HSTS/preload.
- **Vercel Firewall only.** Partial: lacks Turnstile, the OWASP managed ruleset, and DNS/HSTS consolidation. Cloudflare is additive on top.
- **Cloudflare Bot Management (ML bot score).** Enterprise-only, realistic floor ~$2,000–5,000+/mo. Out of reach and unnecessary at zero-stage; Bot Fight / Super Bot Fight is the accessible ceiling.

## Consequences

- **Good:** free at launch; consolidates DNS/TLS/HSTS/DDoS/CAPTCHA; closes the §4 HSTS/preload open item (owner = Cloudflare); edge anti-abuse first layer; partial free contribution to ops observability (Cloudflare security events + traffic analytics).
- **Disliked / costs (named honestly):**
  - The *useful* WAF (OWASP + custom rules) is **$25/mo**, not free — correcting an earlier "closes anti-abuse cheaply" framing.
  - Edge rate-limit is **blunt** (per-IP, thin on Free/Pro; useless against distributed L7 abuse where each source is < 1 RPS). **Real per-user/per-action anti-abuse stays in the app tier.**
  - **Two CDNs in series** (Cloudflare → Vercel) is a place bugs hide (ISR cache interaction); requires the deliberate config above.

## Operational — DNS cutover runbook (GoDaddy → Cloudflare nameservers)

1. **Audit + disable DNSSEC** at GoDaddy/registry **before** changing NS. Stale DS records against new NS cause SERVFAIL (domain stops resolving). Re-enable DNSSEC via Cloudflare's DS record after the cutover.
2. **Recreate ALL records in Cloudflare manually** — auto-import is best-effort and incomplete. Verify especially **email SPF/DKIM/DMARC + MX** (coupled to the transactional-email provider chosen in ADR-0010). A missed MX/SPF record is the most likely cutover failure (mail goes down).
3. **Lower TTL** on existing records 24–48h before the cutover so the switch is fast and reversible.
4. **Change nameservers** at GoDaddy to the two Cloudflare NS. Propagation historically up to 24–48h (usually faster); a mixed-resolution interim state is normal.
5. **Verify** post-cutover: all records resolve; Vercel domain binding intact; email send/receive works end to end.

## Verification owed (at implementation, version-sensitive)

- Current Cloudflare Free vs Pro feature/limit specifics (WAF managed rules, rate-limit rule counts, bot modes).
- Current best-practice config for Cloudflare proxied in front of Vercel (cache rules, SSL).
- (Optional, later) Moving registration to **Cloudflare Registrar** (at-cost renewals): requires confirming `.garden` TLD support **and** the ICANN 60-day post-registration transfer lock. Pure cost optimization; not required for this decision.
