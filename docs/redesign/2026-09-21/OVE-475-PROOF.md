# OVE-475 — decision and evidence proof

Scope: accepted IA/canon, checked-in audit, transition and executable wireflows.
No runtime redesign or whole-product accessibility certification is claimed.

- Current main was fetched and matched local `e554aec506e84ec6f8304c4704084671ed19f399` before branching.
- Eight synthetic decision tests pass with Node 22.23.2; the same command is now in CI. The model has 3 spaces/100 objects, duplicate names and two unassigned edge records.
- In-app Chromium walkthrough: global New entry, search Tomato, select Tomato · Greenhouse, write text, simulate failed publication, retry. UI retained the text and named destination, showed two navigation activations and then the exact fixture receipt `o2 (object)`. No production data was changed.
- Design token gate: 1499 files, zero primitive leaks. Browser spec inventory gate: 30 specs, zero omissions. `git diff --check` passed.
- Text artifacts scanned for credential assignments, signed URLs and JWTs: none found. Settings screenshot 17 inspected: public handle and public photos, no credential/private contact fields shown. Existing public audit content is preserved; no credentials/cookies/session exports added.
- All 40 original screenshot SHA256 hashes reverified; incorrect format-derived dimensions corrected with actual image metadata, without changing image bytes.
- Route ownership covers 114 baseline page files; INFORMATION_ARCHITECTURE.md supplies family-level audience/job/action/move/destination decisions and explicitly identifies new workspace routes.
- The current non-null object space contract was checked in generated DB types and `createFirstPlantEntry`; unsupported unassigned publishing is rejected rather than given a hidden default.
- Existing atomic first-entry creation remains the nested creation contract. Separate acknowledged standalone creation is assigned to its implementation tasks, not falsely described as shipped.

PR, CI and merge receipts are appended to the Linear issue after their actual completion. This file is a pre-merge implementation receipt, not evidence of a production release.
