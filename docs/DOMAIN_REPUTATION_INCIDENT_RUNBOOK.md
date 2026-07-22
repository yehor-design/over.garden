# Domain Reputation Incident Runbook

Status: active operational runbook
Owner: founder/operator
Last verified: 2026-07-22

Use this runbook when a protective DNS provider, browser reputation service, or ISP security product replaces the authoritative `over.garden` address or displays a malware/phishing block page.

## Safety Rules

- Treat the block as a possible compromise until code, deployment, DNS, TLS, and public reputation checks say otherwise.
- Never paste visitor IPs, cookies, tokens, query strings, provider account data, or block-page passthrough URLs into git, Linear, email, or screenshots.
- Keep provider case identifiers private. Repository and Linear evidence may record only that a case ID is present, plus the submission date, status, and redacted outcome class.
- Do not weaken HTTPS, disable browser security, change the canonical domain, or proxy app HTML through an unreviewed service to evade a block.
- A custom DNS resolver, VPN, local hosts entry, or temporary allow action is a user workaround, not incident closure.
- Do not change authoritative DNS records unless authoritative state is wrong. Protective DNS intentionally returning a sinkhole address cannot be repaired by repeatedly rewriting a correct authoritative record.

## OVE-188 Incident Outcome

The incident was first observed on 2026-07-13 and its customer-path closure was verified on 2026-07-22:

- Cloudflare authoritative DNS returns `76.76.21.21` for `over.garden` and `www.over.garden`.
- The default A1-connected system resolver, Cloudflare, Cloudflare Security, Google Public DNS, Quad9, and both public Cisco Umbrella resolver endpoints return the same authoritative address for both hostnames. The deterministic closure result is `14 pass / 0 mismatch / 0 error`.
- A fresh normal Chrome session on the default A1 connection loaded apex and `www`, followed their canonical Bulgarian routes, and rendered the OverGarden application without custom DNS, VPN, a hosts override, provider bypass, temporary allow action, or security block page.
- Exact-main baseline `0b7ac6c294894791b20d9998a6f7e6856130240d` passed GitHub CI run `29662442419`; Vercel production deployment `dpl_4JqRWGXLEQLstKKk9877f39mTRPS` was `READY` for that SHA and owned both canonical aliases.
- Canonical HTTPS routes and hostname-specific TLS certificates passed. The production dependency graph was refreshed to remove newly disclosed high-severity runtime advisories, and the bounded production audit reports no known vulnerability. Production logs contained zero error entries and zero HTTP `500` responses in the checked 24-hour window.
- Whalebone confirmed removal from its global threat database and closed its false-positive case on 2026-07-14. One Cisco case later reached a resolved state; the related apex case remained re-opened with an unknown dashboard reputation, so a bounded follow-up was submitted on 2026-07-22. Provider identifiers remain private. The still-asynchronous dashboard correspondence does not override the authoritative resolver and customer-path evidence.
- Google Safe Browsing reported no unsafe content, and the observed VirusTotal scan reported zero detections including a clean ESET result. The bounded audit found no evidence of a compromised deployment.

OVE-188 is closed as `false-positive remediation propagated / customer path recovered` on 2026-07-22. Reopen the incident immediately if A1, Cisco Umbrella, or another protective resolver again substitutes a sinkhole, if a normal browser shows a reputation block, or if a bounded security check finds a credible compromise indicator. A past closure never substitutes for checks against a later release.

## Deterministic DNS Check

From `apps/web`:

```bash
pnpm smoke:protective-dns
```

The script:

1. discovers the zone's authoritative nameservers through a neutral baseline resolver;
2. obtains the expected IPv4 set directly from authoritative DNS;
3. compares the system resolver plus Cloudflare, Cloudflare Security, Google, Quad9, and both public Cisco Umbrella resolver endpoints;
4. prints public domain/address evidence only and never prints the system resolver or visitor address.

Exit codes:

- `0`: every checked resolver matches authoritative DNS;
- `1`: the check could not complete reliably;
- `2`: at least one resolver replaced or otherwise disagreed with the authoritative answer.

Exit `0` is necessary but not sufficient for closure. The default A1 resolver and a normal browser on the A1 connection must also load canonical HTTPS without a block page or bypass.

## Triage Checklist

1. Confirm `main` and `origin/main` identify the intended release commit.
2. Confirm GitHub CI succeeded for that exact commit.
3. Confirm the Vercel production deployment is `READY`, targets `production`, and serves that exact commit through both canonical aliases.
4. Query Cloudflare authoritative nameservers directly and compare apex plus `www` with the records in `docs/INFRASTRUCTURE_REGISTRY.md`.
5. Validate TLS hostname coverage and expiry for apex plus `www`.
6. Probe canonical routes through the authoritative address with correct SNI/Host handling.
7. Review recent production errors and HTTP 5xx responses without recording request-level personal data.
8. Run the production dependency audit and investigate any actionable advisory.
9. Inspect current HTML and application asset origins for unexpected scripts, frames, redirects, or injected content.
10. Check Google Safe Browsing, VirusTotal, Cisco Talos, and the affected protective DNS service. Record only result classes and timestamps.

If any compromise indicator is credible, stop false-positive outreach and follow the security incident path first.

## Upstream False-Positive Remediation

### Whalebone / A1 Net Protect

Whalebone documents `domain-report@whalebone.io` for incorrectly blocked domains and can apply a confirmed false-positive allow decision across its customers. Send a plain-text report that includes:

- `https://over.garden` and `https://www.over.garden`;
- the observed `Blacklist` / malware block class and date;
- authoritative DNS and production hosting classes;
- Google Safe Browsing and VirusTotal result classes with check dates;
- a short factual description of OverGarden;
- a request for global false-positive review and reclassification.

Do not attach a block-page screenshot unless it is cropped/redacted to exclude visitor data and passthrough URLs.

### Cisco Talos / Umbrella

Sign in at the Talos Reputation Center, open the domain reputation ticket for `over.garden`, and request security reclassification from `Untrusted / Phishing / Spam` to a benign/trusted state. Include the same bounded evidence. Track the ticket identifier privately; Linear may record only submission state, date, and outcome class.

Cisco's normal content-category request is secondary. The active security reputation categories must be corrected first.

## Verification And Closure

Recheck after each provider decision and at least once from a fresh A1 client session:

```bash
cd apps/web
pnpm smoke:protective-dns
```

OVE-188 may move to `Done` only when all are true:

- the A1 default resolver returns the authoritative address for apex and `www`;
- Cisco Umbrella no longer returns a security sinkhole;
- a normal browser on A1 loads canonical HTTPS without custom DNS, VPN, hosts override, provider bypass, or temporary allow action;
- TLS, canonical routes, exact-commit CI/deployment proof, and bounded security checks still pass;
- the final redacted outcome is recorded in `docs/INFRASTRUCTURE_REGISTRY.md` and Linear.

The 2026-07-22 closeout satisfied every condition above. The unresolved administrative state of one provider dashboard case remains monitored separately and does not negate resolver parity or the normal A1 browser proof.

Changing the domain, asking every user to change DNS, or relying on an allowlisted operator account does not satisfy this gate.

## Provider References

- A1 Net Protect: `https://www.a1.bg/a1-net-protect`
- Whalebone false-positive contact: `https://www.whalebone.io/contact`
- Whalebone threat categories: `https://docs.whalebone.io/en/immunity/data_analysis_threats.html`
- Cisco security reclassification: `https://www.cisco.com/c/en/us/support/docs/security/umbrella/224920-request-a-security-reclassification-for.html`
- Cisco categorization requests: `https://www.cisco.com/c/en/us/support/docs/security/umbrella/224724-submit-a-categorization-request.html`
- Cisco Talos support: `https://support.talosintelligence.com/`
- Google Safe Browsing status: `https://transparencyreport.google.com/safe-browsing/search`
