# Artifact verification

- 45 unique finding IDs; P1: 5, P2: 37, P3: 3.
- 114 page.tsx files inventoried from the local baseline.
- 40 retained desktop/reference screenshots, with dimensions and SHA-256 manifest.
- Markdown local links checked: no missing targets.
- HTML viewer opened in the browser and visually inspected; priority filter returned 5 P1 findings; searching space inside P1 returned 2.
- Six responsive DOM spot-check records saved. No document overflow in these samples; this is not a complete reflow test.
- Mobile filter Escape returned focus to Filters.
- Screenshot override artifacts excluded instead of reported as product defects.
- Production publishing, uploads, likes/follows, settings, erasure and moderation were not performed.
- No application code changed. CI, a fresh axe scan, screen-reader certification and performance benchmarks were not run for this documentation-only audit.
- Temporary viewport overrides reset; original Chrome tab returned to OverGarden home.

The HTML preview image is `report-preview.png`. It is an artifact QA screenshot, not another production-screen observation.

## Evidence metadata correction during OVE-475 (2026-09-21)

The original screenshot manifest incorrectly treated every file with a `.png`
suffix as PNG bytes when extracting dimensions. All 40 byte hashes still match.
Actual image metadata was read with macOS `sips`; dimensions and the detected
format are corrected in the manifest without altering any screenshot bytes or
historical links. Many browser captures are JPEG despite their historical suffix.
