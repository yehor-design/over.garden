# Thiings illustration system — OVE-479

Implementation: 2026-09-21, based on main
`a4c9a1106d3e8cfeb5b1b4c7a11f378d55eaf7e2`.
Exact tested, merge and deployment identities are recorded in the Linear release
receipt after CI and production verification; this document does not predeclare them.

## Delivered

The existing six illustrations remain intact. Three additional locally served
360px WebPs provide Garden, Terracotta Pot and Bird Watching Binoculars. Stable
purpose IDs map first garden, space setup, object setup, no entries, no results
and setup success to the selected art. Every shipped file has source item and
image URLs, a fresh source-download timestamp and checksum, local filename,
dimensions, byte count, derivative checksum, purpose and source-attribution facts
in `ove-479/asset-manifest.json`. Historical download dates are explicitly unknown,
not invented from a commit date. No source PNGs or downloadable collection ship.

`components/ui/illustration.tsx` is the shared decorative renderer: reserved
96/144px square, whole-object contain, empty alt, lazy loading, async decoding.
`EmptyState` uses it; the real garden creation introduction uses the object-setup
purpose. Repeated art is removed from attention, recent entries, inventory and
spaces on the same garden page, leaving one illustration beside object creation.
The owner's erasure queue is text-only. Filtered no-results states retain their
existing filters/clear action without art. Later progressive-space and object
flows consume the same purpose IDs; this task does not claim those flows shipped.

New assets are 32,816 / 18,160 / 28,518 bytes. All nine are below 40KB each,
360 × 360, loaded only where referenced. No third-party runtime hotlink, Next
image optimization, photograph substitution, session read, public route,
persistence, authorization or schema change is introduced.

## Reference interpretation

Airbnb's [setup overview](https://mobbin.com/screens/19c2044f-ec75-4265-bcfb-307faba7b778)
uses small dimensional objects to distinguish setup steps; its
[step introduction](https://mobbin.com/screens/e8e9b940-5b4d-45db-a5dd-8260a2ceb3e9)
places one object beside explanatory copy. Both were visually inspected through
Mobbin. We transfer the contextual illustration and restraint, not the house
subject, travel steps, or large hero scale. These are observed examples, not
evidence of conversion improvement in OverGarden.

The owner requests unrestricted collection selection and free use, with no
purchase/review gate. Provider facts remain in `EXECUTION_CONTRACT.md` and the
manifest; no commercial-license receipt is claimed. Nature Journal was rejected
for baked-in Latin text; decorative plants never replace a user's organism photo.

## Verification

- Production build, lint and typecheck passed.
- Full `pnpm test`: 561 files / 4,278 tests passed; 6 files / 29 tests retain
  their existing skip conditions. Media worker: 14 passed. Mechanical checks
  include illustration file ownership, asset checksums/byte budget, component
  accessibility coverage, browser registration and settled workspace reads.
- Registered `illustrations.spec.ts`: 3 passed, covering UK/BG/RU ×
  320/390/768/1280/1920 CSS pixels. Real images decode at 360px, rendered boxes
  reserve 144px, accessible image roles are absent, and headings remain visible
  in unchanged positions after every image source is deliberately broken.
- Fifteen WCAG 2/2.1/2.2 AA axe scans: see `ove-479/axe-summary.json` for actual
  rule results, including incomplete counts. No rules are disabled.
- `ove-479/{uk,bg,ru}-{320,1280}.png` are real light-theme component contact
  sheets with the production stylesheet and embedded production fonts. The
  initial renderer omitted font variables; corrected evidence replaces that run.
- Real garden browser regression: 6 passed, including creation introduction,
  narrow/wide accessibility, session-store failure, and native form endpoints.
  Clean-checkout CI results belong in the release receipt. CI retains public static/no-JS, authentication, hard-load
  workspace-failure and mutation tests.

The contact sheet compares six examples; it is not a six-illustration page
template. Visual inspection and semantic role checks were performed. A native
VoiceOver/NVDA session was not performed, and no complete screen-reader or
whole-product WCAG conformance is claimed. Art is noninteractive and decorative;
the existing text, keyboard controls, focus order and server outcomes remain.
