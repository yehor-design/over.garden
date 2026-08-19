# OverGarden Typography Contract

Status: OVE-208 implementation and release contract  
Date: 2026-07-22  
Primary proportional family: Google Sans  
Semantic monospace family: Geist Mono

## Product Decision

Google Sans is the one proportional typography owner for OverGarden browser
interfaces in Ukrainian, Bulgarian, and Russian. The change is intentionally a
reversible design-system hypothesis: a coherent, warm, Cyrillic-capable family
may improve perceived craft and continuity between reading and authoring, but
OVE-208 does not claim a measured improvement to activation, retention, trust,
or willingness to journal.

The migration is typography-led and does not change information architecture,
copy, colors, icons, photography, navigation, or action semantics. Its sole
component-level layout correction moves the existing community report menu's
positioning containment to the full action row below the `sm` breakpoint so
long localized copy remains inside a 320 px viewport; desktop containment and
the report interaction stay unchanged. Google Sans does not grant or imply
Google endorsement, and OverGarden must not imitate Google or Material trade
dress. The existing warm, human, real-photo-led, non-clinical visual language
remains authoritative.

## Binding Behavior

- `--font-overgarden-sans` owns the proportional stack.
- `--font-sans` and `--font-heading` resolve to that token.
- Root text, headings, controls, placeholders, contenteditable regions,
  dialogs, sheets, popovers, toasts, portals, and journal prose inherit it.
- `--font-overgarden-mono` owns the semantic monospace stack.
- `--font-mono`, `code`, `pre`, `kbd`, `samp`, identifiers, hashes, and
  technical diagnostics retain Geist Mono.
- Components must not add their own font loader or persist `font-family` into
  user content.
- `font-optical-sizing: auto` is enabled for Google Sans.
- `font-synthesis: none` is enabled because normal weights `400..700` and true
  Italic are pinned and verified.
- Product utility classes use `400`, `500`, `600`, and `700`; raw documents use
  explicit `500`, `650`, and `700`. The former raw selected-state value `800` is
  deliberately reduced to `700`; introducing `100..300` or `800..900` is a
  contract violation until the asset and browser evidence is reviewed again.
- Grade remains `GRAD=0`; the web assets omit the grade axis. Grade is not a
  semantic-weight substitute or a user-facing setting.

The same contract reaches three complete-document owners:

1. the normal App Router root layout;
2. the standalone global-error document;
3. the shared literal renderer used by community, profile, object-passport,
   and journal-entry raw `404/410` responses.

The raw documents embed the generated `@font-face` contract because they bypass
React layout CSS. They retain their existing status, `noindex`, `no-store`,
localization, referrer suppression, and generic privacy-safe copy.

## Language Context And Glyph Contract

The document `lang` remains the shaping authority: `uk`, `bg`, or `ru` according
to the interface-locale contract. In particular, Bulgarian documents retain
`lang="bg"`, which activates the font's `cyrl/BGR` `locl` substitutions. No
`font-language-override`, locale inference service, or persisted UGC language
field is introduced.

The pinned assets cover:

- normal and true Italic;
- variable weight `400..700`;
- optical size `17..18`;
- Latin, Latin Extended, Cyrillic, and Cyrillic Extended;
- the binding Ukrainian, Bulgarian, Russian, Latin/scientific-name, combining
  mark, `№`, and `₴` corpus in OVE-208.

The offline verifier decodes and shapes the actual WOFF2 OpenType data. It
checks the family, PostScript name, version, copyright, axes, `cmap`, real
Roman/Italic, and at least 23 Bulgarian `locl` substitutions under `cyrl/BGR`.
For both the normal and Italic Cyrillic assets it shapes `вгдпт` and requires
default and Russian shaping to resolve to base glyphs `90/91/94/109/112`
(`uni0432`, `uni0433`, `uni0434`, `uni043F`, `uni0442`), while Bulgarian
shaping resolves to localized glyphs `138/139/140/148/149` with the matching
`.loclBGR` names. A CSS family name without this real glyph-font proof is not
accepted.

## Official Source And License

Google Sans was acquired only from the official Google Fonts endpoints:

- specimen: <https://fonts.google.com/specimen/Google+Sans>
- metadata: <https://fonts.google.com/metadata/fonts/Google%20Sans>
- download manifest:
  <https://fonts.google.com/download/list?family=Google%20Sans>
- CSS API used only for the reviewed acquisition record:
  <https://fonts.googleapis.com/css2?family=Google+Sans:ital,opsz,wght@0,17..18,400..700;1,17..18,400..700&display=swap>
- license FAQ: <https://developers.google.com/fonts/faq?hl=en>

Pinned upstream facts:

- Google Fonts revision: `v69`
- metadata `lastModified`: `2026-05-21`
- binary version: `Version 13.002;[5e3df34c1]`
- copyright:
  `Copyright 2025 The Google Sans Project Authors (github.com/googlefonts/googlesans)`
- license: `OFL-1.1`
- exact license: `apps/web/licenses/google-sans/v69/OFL-1.1.txt`
- exact license SHA-256:
  `07424db4089211e77dd8a0bca14fbf46e8801045d6db9061fbd6ce08e582594e`

The repository does not use Product Sans, Google Sans Flex, Google Sans Code,
an extracted device font, an unofficial mirror, a conversion service, or an
unreviewed npm font package.

### Google Sans immutable asset inventory

| Style  | Subset       |  Bytes | SHA-256                                                            | Preload |
| ------ | ------------ | -----: | ------------------------------------------------------------------ | ------- |
| normal | cyrillic-ext | 23,996 | `6afd640338d8347583ef6592ae90bcc7d19999d916659c0a7a4e8b2cb23a6bf2` | no      |
| normal | cyrillic     | 24,248 | `a0c080f0d0cba3898bf11fbae986ada27453c00acbdee317fb9c010cd9aac067` | yes     |
| normal | latin-ext    | 31,144 | `ccf1c4db8ac323f7978f68382ca5afcd76a2b9c23134607e2d7a409708eb5e5f` | no      |
| normal | latin        | 51,956 | `73a7f9cfb110ed6731b3fd56ad86bfeae56abac8ed564a6978bacefbea051d92` | yes     |
| italic | cyrillic-ext | 25,668 | `446716d6c1bb5267aabe5abc9137fff4c30f0a4449024186e18d5159980fd4e0` | no      |
| italic | cyrillic     | 26,216 | `4d5923050bedeb0bc4a15947904d0e01e5e01b0af4699236db923479ba676a58` | no      |
| italic | latin-ext    | 32,980 | `2ca2b314df183802acba615cf0c4c02e4f109e515d74d194532998331f775f51` | no      |
| italic | latin        | 56,980 | `e55b6b52cd3f2d49cfd4b6267dc2ae61c4a4fd86661c5103e9b7cff2f0c087d7` | no      |

The typed source of truth is
`apps/web/src/lib/typography/google-sans-contract.ts`. Each public filename
contains the first 16 hexadecimal characters of its full content hash. The
generated `apps/web/src/app/google-sans.css` must remain byte-equivalent, after
canonical formatting, to that manifest.

## Preserved Geist Mono Contract

The previous semantic monospace role remains Geist Mono, but OVE-208 also pins
it locally so an ordinary production build no longer depends on
`next/font/google` network retrieval. The six unchanged official Google Fonts
`v6` normal variable assets cover the prior CSS ranges and remain demand-only;
none is preloaded.

- binary version: `Version 1.701`
- weight axis: `100..900`
- metadata `lastModified`: `2026-06-08`
- license: `OFL-1.1`
- exact license: `apps/web/licenses/geist-mono/v6/OFL-1.1.txt`
- exact license SHA-256:
  `0acca17d633ecc7180aa12d8a60a95889d87a439cb83884597ff278046743dcb`

| Subset       |  Bytes | SHA-256                                                            |
| ------------ | -----: | ------------------------------------------------------------------ |
| cyrillic-ext |  6,204 | `e27f657e38d52887baa3b6b2f812bef93dfdd356f0810e40edd4ee284cc7e9f6` |
| cyrillic     | 12,872 | `75b3bedbebc35f347c0ae3b416aa871941555357e7b0f83767eb5987875589ed` |
| symbols2     |  5,892 | `d67e4a94ba498635f764ddca7d1ec4271f5642f032eb24b426764480f66f8497` |
| vietnamese   |  7,728 | `16e1d48b6dd29eb240aec5db36184eb182933c082cd43de7f35af686d58087d2` |
| latin-ext    | 14,712 | `745994b5cd950ec201b66526375f057d540847cccfc70f4f24f5f571d26d3923` |
| latin        | 23,108 | `5f3d6ad60f29d6cb708414ec6887163d63bf197377ef5417d2483ff31ace6c3b` |

Its typed source is
`apps/web/src/lib/typography/geist-mono-contract.ts`; generated CSS is
`apps/web/src/app/geist-mono.css`. Geist Mono bytes are reported separately and
do not count against the Google Sans proportional-family budgets.

## Fallback And Loading

Google Sans uses `font-display: swap`. Meaningful local fallback text must
paint when WOFF2 requests are delayed or blocked; a focused browser case proves
that behavior and normal cases prove convergence to the pinned webfont.

The fallback was measured from the pinned normal Latin WOFF2 with the installed
Next.js `16.2.11` fontkit and its local-font average-width algorithm:

- Google Sans weighted average width: `463.3953488372093` at UPM `1000`
- Arial weighted average width: `934.5116279069767` at UPM `2048`
- raw size adjustment: `1.0155397173004181`
- `size-adjust: 101.55%`
- `ascent-override: 95.12%`
- `descent-override: 28.16%`
- `line-gap-override: 0.00%`

These values are generated evidence, not visual guesses. Component-specific
spacing patches are not an accepted substitute for fallback metrics.

## Delivery, Cache, And Privacy Boundary

- All browser font URLs are same-origin under content-addressed `/fonts/**`.
- Only the canonical `/fonts/**` namespace bypasses market/locale Proxy
  handling. A `.woff` or `.woff2` suffix outside that namespace remains inside
  the Proxy boundary for localization, `private, no-store`, and privacy
  handling.
- WOFF2 responses use `Content-Type: font/woff2`.
- Content-addressed responses use
  `Cache-Control: public, max-age=31536000, immutable`.
- Responses retain `X-Content-Type-Options: nosniff` and
  `Cross-Origin-Resource-Policy: same-origin`.
- Lifecycle HTML remains `private, no-store`; its font assets remain immutable.
- Runtime code, built CSS, and browser traces must contain no Google Fonts CDN
  dependency.
- No CSP expansion for Google Fonts or another font host is permitted.
- Font paths and cache selection never vary on identity, account state, locale
  cookie, private content, referrer, media key, or precise location.

OVE-208 adds no font CDN or other external runtime font dependency. The same
closeout later recorded a temporary GitHub Actions budget freeze in
`docs/INFRASTRUCTURE_REGISTRY.md`; that ops note is unrelated to font delivery
and does not introduce a Google Fonts/Gstatic dependency.

## Preload, Lazy Loading, And Byte Budgets

Only normal Cyrillic is preloaded. The larger normal Latin face remains
CSS-demanded: ordinary Ukrainian, Bulgarian, and Russian pages still request it
for the OverGarden name, but it does not compete with the first fallback paint.
This policy reduced the fixed-profile local median LCP below the pre-change
baseline while preserving `font-display: swap`, zero CLS, and eventual Google
Sans convergence. Latin Extended, Cyrillic Extended, every Italic face, and
every Geist Mono face remain demand-loaded.

| Proportional asset set          | Pinned bytes |        Budget |
| ------------------------------- | -----------: | ------------: |
| normal Latin + Cyrillic         |       76,204 |     <= 81,920 |
| core + Cyrillic Extended        |      100,200 |    <= 107,520 |
| core + Latin Extended           |      107,348 |    <= 107,520 |
| all normal subsets              |      131,344 |    <= 133,120 |
| all Italic subsets, demand-only |      141,844 | no eager load |

Pages with no italic or extended characters must not request those assets.
An ordinary Cyrillic route with the Latin brand name must request exactly the
two core Google Sans resources before the final measurement.

## Performance Evidence Contract

The `ove208.typographyPerformance.v2` artifact is fail-closed. It requires an
exact 40-character commit SHA, an explicit `local` or `production` environment,
the exact `/bg` route, a clean origin, the fixed profile below, `5..20` finite
positive measurements, non-negative CLS, and a summary recomputed from the raw
runs. A comparison is accepted only when its origin, environment, route,
profile, and explicit `--compare-sha` match the baseline. Compared artifacts
also embed the baseline contract version, label, exact SHA, SHA-256, and parsed
summary; the parser recomputes every comparison field from that summary and the
after runs, while the durable bundle independently verifies the referenced
baseline bytes against the embedded SHA-256.

The fixed lab profile uses Chromium, a fresh context per run, blocked service
workers, disabled cache, `390x844`, four-times CPU slowdown, 40 ms latency,
10 Mbps download, and 2 Mbps upload. The critical route is `/bg`. At least five
cold-cache runs are required before and after; medians are compared.

The pre-change implementation at SHA
`52172a927f48e7839b102347f3b0caa972343c78` used `Geist` and `Geist_Mono` from
`next/font/google`; it was not a pinned local Geist proportional contract. Its
cold `/bg` request inventory was three generated Next.js WOFF2 resources and
two preloads:

| Pre-change resource | Encoded body |     Transfer |
| ------------------- | -----------: | -----------: |
| Geist Mono Latin    |     23,108 B |     23,408 B |
| Geist Sans Latin    |     29,288 B |     29,588 B |
| Geist Sans Cyrillic |     14,900 B |     15,200 B |
| **Total**           | **67,296 B** | **68,196 B** |

That exact pre-change SHA produced these v2 baselines with the final hardened
performance runner:

| Metric                        | Local production build, 7 runs | Immutable Production, 5 runs |
| ----------------------------- | -----------------------------: | ---------------------------: |
| median LCP                    |                         228 ms |                     1,540 ms |
| median total CLS              |                       0.000219 |                            0 |
| median font-window CLS        |                       0.000219 |                            0 |
| median `document.fonts` ready |                         267 ms |                   1,626.7 ms |
| median font transfer          |                       68,196 B |                     68,196 B |
| median font encoded body      |                       67,296 B |                     67,296 B |
| median CSS transfer           |                       15,120 B |                     15,512 B |
| max font requests             |                              3 |                            3 |
| max font preloads             |                              2 |                            2 |

The durable authoritative baseline bundle is the Linear OVE-208 attachment
`c930b13e-9044-4ffe-a044-fa5a49a7f389`, titled
`OVE-208 before baseline — hardened final runners v3`. Its archive SHA-256 is
`8a0060e7632795ec5e985abf9809c4f98f6d27fe27ade71d76e4aeab3f044ae8`;
its validated manifest SHA-256 is
`57225e4bc39f1f86fed95edd82807573b38be4ad137219bb8e089e2972f6d6f8`.
It contains the following fail-closed v2 artifacts:

| Environment | Artifact                                | SHA-256                                                            |
| ----------- | --------------------------------------- | ------------------------------------------------------------------ |
| production  | `performance-before-production-v2.json` | `41ef9a3e76bc3d87b788553721682056593c59c0bc441904a51838db7ac49b5b` |
| local       | `performance-before-local-v2.json`      | `f51d33a8b5f48a1829228a63a54d0c856fcd32191a6cec5cdb4e88c02e382164` |
| browser     | `browser-before-v2.json`                | `befa531e0fb7ebde253bfa42967961a947eb5dacbe219a3fa0245a8a0606a7c1` |
| screenshots | `screenshots/` (30)                     | exact hashes in `manifest.json` and the browser artifact           |

The bundle was captured from a clean detached checkout of the exact baseline
SHA with a newly created, initially empty screenshot directory. Its manifest
binds all four final evidence sources:

- browser runner:
  `498b15cb49c203ead6627bf9392bee1b40741c0d4ad99b57b104aa4931a0548c`;
- browser contract:
  `70564982b8db30d89b95171ca7acb0a599ccda81e2dae3630549a563f25a8c14`;
- performance runner:
  `134a1c07be40de13c1b31aff7a08613ee39b91e0f33ed69b2206e706b32d1167`;
- performance contract:
  `aa8e27e78d2b071eb9fae3d0c77c7995fec4ca504ea5ff7dd0af8a7883da26c3`.

Both gates preserve and reject query/hash suffixes instead of normalizing them
away. The browser gate also requires the exact clean URL to be same-origin and
classifies every lazy-probe request, CSS source, and preload against the pinned
14-asset allowlist.

The post-change gate requires:

- median LCP regression no greater than the stricter of `100 ms` and `5%`;
- font-window CLS `<= 0.02`;
- total CLS `<= 0.1`;
- exactly two core Google Sans requests and one matching normal-Cyrillic
  preload;
- core transfer `<= 80 KiB`;
- zero eager Italic or extended assets on the fixed `/bg` case;
- Google Sans as the computed body family;
- zero external font requests and zero page errors.

No post-change metric or final implementation SHA is asserted here before it
exists. The final exact-SHA comparison, request inventory, and deployment
evidence are recorded in the OVE-208 mainline closeout after the production
deployment is `READY`; the resulting values must be added before Linear is
moved to Done.

## Browser, Responsive, And Accessibility Proof

`pnpm typography:browser` is a focused font gate across Chromium, Firefox, and
WebKit. It covers the Ukrainian, Bulgarian, and Russian homes; 15 representative
owner surfaces spanning catalog, editorial, auth/help, journal prose, profile,
workspace, creation, social, community, operator/admin, not-found, loading,
error, and offline states; the guarded global-error state; and seven exact raw
lifecycle states: community `404` plus profile, object-passport, and journal
entry `404/410`. Product and raw-lifecycle routes exercise `320`, `390`, `768`,
`1440`, and 200% reflow in all three engines; owner surfaces use the focused
`390`/`1440` pair there, while the full OVE-185 accessibility matrix supplies
their wider eight-viewport coverage.

The single community `404` is the explicit equivalent required by the
lifecycle acceptance matrix: unknown/missing and draft communities intentionally
collapse into the same hard localized `404`. Archived communities retain their
canonical privacy-safe public readback; the community schema has no `removed`
state and no community `410` lifecycle. The repository query test proves that
only active and archived communities are publicly discoverable, while the
focused lifecycle-document test owns the shared localized `404` rendering.
Profile, object-passport, and journal entry retain distinct `404` and `410`
proofs.

Every case verifies font readiness, computed family, same-origin request
inventory, lazy variants, the representative corpus and supported weights,
semantic Geist Mono, layout bounds, expected status and locale, and
page/console/font-request errors. A dedicated semantic inheritance probe covers
headings, journal prose, buttons, inputs, placeholders, selects, textareas,
contenteditable, dialogs, popovers, toasts, and portals. Chromium additionally
uses `CSS.getPlatformFontsForNode` to prove that the real custom font rendered
the required proportional and monospace nodes instead of only appearing in
CSS.

The pre-change Chromium baseline is
`browser-before-v2.json` in the durable Linear bundle above, with
SHA-256
`1b04d04f108b2bfd1955efeec323abe89926fce21690848b6b8c22970aaad640`.
It completed 80 route/viewport matrix cases, one delayed-font case, and two
global-error cases (83 total), and produced 30 deliberate mobile/desktop
screenshots across all three locales, representative owner surfaces, global
error, and all seven raw lifecycle states, with zero runner errors. All 83 cases
were expected to fail because the post-migration Google Sans contract was
intentionally run against the pre-change Geist build; this demonstrates that
the gate discriminates the old implementation and is not a count of newly
discovered product regressions.

The pre-change application had no Google Sans delayed-font fallback rail. Its
single delayed-font baseline case therefore also failed the future-family
contract and cannot be represented as pre-change fallback-convergence proof.
OVE-208 must instead prove, after the change, that meaningful Arial fallback
paints while the Google Sans WOFF2 response is blocked and that the same page
then converges to the pinned font when loading resumes.

This focused gate extends rather than replaces `pnpm test:a11y`. The complete
OVE-185/OVE-205 Chromium regression matrix remains binding across its 171
scenarios, 642 route/viewport checks, eight viewport profiles, Axe checks,
keyboard/focus behavior, reduced motion, localization continuity, loading,
error, denied, auth, garden, social, community, admin/operator, and lifecycle
states. Evidence uses only deterministic fixtures and never production UGC.

## Verification

Run from a fresh exact checkout. The server lifecycle is part of the proof so a
concurrent build cannot replace `.next` beneath a running test server:

```bash
pnpm install --frozen-lockfile
cd apps/web

ove208_exact_sha="$(git rev-parse HEAD)"
test -z "$(git status --porcelain)"

pnpm exec playwright install chromium firefox webkit
pnpm local:bootstrap
../../infra/run-with-local-infra-env pnpm visual:fixtures:seed
../../infra/run-with-local-infra-env pnpm visual:fixtures:verify

pnpm typography:check
pnpm typography:report
pnpm exec vitest run \
  src/app/layout.test.tsx \
  src/app/globals.test.ts \
  src/app/global-error.test.tsx \
  src/lib/public-lifecycle-document.test.ts \
  src/lib/public-community-lifecycle.test.ts \
  src/lib/public-object-passport-lifecycle.test.ts \
  src/lib/public-profile-lifecycle.test.ts \
  src/lib/public-journal-entry-lifecycle.test.ts \
  src/proxy.test.ts \
  next.config.test.ts
pnpm localization:coverage:check
pnpm lint
pnpm typecheck
pnpm test
../../infra/run-with-local-infra-env pnpm build
git diff --check

PORT=3000 HOSTNAME=localhost \
  VISUAL_FIXTURES_ENABLED=true \
  VISUAL_FIXTURES_TARGET=local \
  VISUAL_FIXTURES_DATABASE=overgarden \
  VISUAL_FIXTURES_ALLOW_PREVIEW=false \
  ../../infra/run-with-local-infra-env pnpm start \
  >/tmp/ove208-browser-server.log 2>&1 &
ove208_browser_server_pid=$!
trap 'kill "$ove208_browser_server_pid" 2>/dev/null || true' EXIT
for _ in {1..30}; do
  curl -fsS http://localhost:3000/health >/dev/null && break
  sleep 1
done
curl -fsS http://localhost:3000/health >/dev/null

pnpm typography:browser -- \
  --base-url http://localhost:3000 \
  --browsers chromium,firefox,webkit \
  --sha "$ove208_exact_sha" \
  --output /tmp/ove208-after-browser.json \
  --screenshot-dir /tmp/ove208-after-screenshots
ACCESSIBILITY_BASE_URL=http://localhost:3000 pnpm test:a11y

kill "$ove208_browser_server_pid"
wait "$ove208_browser_server_pid" || true
trap - EXIT

PORT=3101 HOSTNAME=127.0.0.1 \
  VISUAL_FIXTURES_ENABLED=true \
  VISUAL_FIXTURES_TARGET=local \
  VISUAL_FIXTURES_DATABASE=overgarden \
  VISUAL_FIXTURES_ALLOW_PREVIEW=false \
  ../../infra/run-with-local-infra-env pnpm start \
  >/tmp/ove208-performance-server.log 2>&1 &
ove208_performance_server_pid=$!
trap 'kill "$ove208_performance_server_pid" 2>/dev/null || true' EXIT
for _ in {1..30}; do
  curl -fsS http://127.0.0.1:3101/health >/dev/null && break
  sleep 1
done
curl -fsS http://127.0.0.1:3101/health >/dev/null

pnpm typography:performance -- \
  --base-url http://127.0.0.1:3101 \
  --environment local \
  --label after-local \
  --sha "$ove208_exact_sha" \
  --output /tmp/ove208-after-local-v2.json \
  --runs 7 \
  --compare /tmp/ove208-before-local-v2.json \
  --compare-sha 52172a927f48e7839b102347f3b0caa972343c78

kill "$ove208_performance_server_pid"
wait "$ove208_performance_server_pid" || true
trap - EXIT

pnpm mainline:closeout:check
```

After that exact SHA is deployed and `READY`, compare the canonical production
origin against the production baseline with the same explicit compatibility
keys:

```bash
ove208_exact_sha="$(git rev-parse HEAD)"

pnpm typography:performance -- \
  --base-url https://over.garden \
  --environment production \
  --label after-production \
  --sha "$ove208_exact_sha" \
  --output /tmp/ove208-after-production-v2.json \
  --runs 5 \
  --compare /tmp/ove208-before-production-v2.json \
  --compare-sha 52172a927f48e7839b102347f3b0caa972343c78
```

The canonical live browser artifact must also cover `/`, `/bg`, `/ru`, the
seven redacted lifecycle `404/410` paths (or the explicitly recorded equivalent
matrix), and the three focused engines. Supply only synthetic or already-public
tombstone paths through the runner's seven `--raw-route` arguments. It must be
paired with direct response proof that every referenced content-hashed WOFF2 is
`font/woff2`, `public, max-age=31536000, immutable`, `nosniff`, and same-origin,
while lifecycle HTML remains `no-store`. Bind the run independently to the
exact `READY` Vercel deployment SHA, then rerun the OVE-186 production and
protective-DNS smokes. Never put an identity, private slug, token, or production
UGC in the artifact.

When the founder requires a direct push to `main`, no PR-owned Vercel Preview
exists. The closeout must record that preview gate as an explicit direct-main
waiver rather than silently claiming it passed, and substitute the seeded
production-build three-engine trace plus the immutable exact-SHA Vercel
deployment URL in `READY` state before canonical aliasing and the canonical
production trace. The reviewed diff and independent acceptance/security reviews
remain mandatory; the waiver does not weaken any runtime, privacy, or exact-SHA
gate.

The asset verifier also injects a one-byte mutation through its test I/O and
requires rejection. CI runs the offline asset gate before lint/build, installs
the three focused browser engines, runs the typography browser gate against the
seeded built app, stores the exact-SHA JSON plus its 30 hash-manifested
screenshots in a 90-day GitHub Actions artifact, and then runs the complete
accessibility matrix.

The CLI `--sha` value is an asserted evidence label, not server attestation.
In GitHub Actions both browser and performance runners fail closed unless that
value equals `GITHUB_SHA`, binding the report to the checked-out build and test
process. Production evidence additionally requires the same SHA on a Vercel
deployment in `READY` state plus a canonical-origin live smoke. A local JSON
artifact by itself is therefore not accepted as exact-SHA production proof.
The durable Linear bundle must contain both baseline and after artifacts, their
SHA-256 values, the exact normalized command arguments, and the recomputed
comparison result; an after-performance JSON detached from its baseline is not
accepted as auditable comparison evidence.

## Explicit Refresh Procedure

There is no automatic font-refresh step in install, dev, test, or production
build. A future refresh is an explicit reviewed change:

1. revalidate the official specimen, metadata, download manifest, CSS response,
   and OFL status;
2. download candidates into a temporary directory from the allowlisted
   official URLs only;
3. inspect family/version/copyright/axes/`cmap`/`GSUB` and compare every byte;
4. update the typed manifest with the new immutable source metadata, exact
   bytes, full SHA-256, content-hashed path, and reviewed budget;
5. regenerate tracked CSS with
   `pnpm exec tsx scripts/verify-google-sans-assets.ts --write`;
6. run the mutation, browser, performance, accessibility, build, and exact-SHA
   release gates;
7. review the binary and license diff before merge.

The refresh must fail closed on an unapproved license, missing glyph, lost
Italic, lost `BGR locl`, changed axis, unofficial host, or unapproved budget.

## Rollback

Rollback remains token-level and contains no database or user-content work:

1. revert the OVE-208 typography behavior change and restore the exact prior
   Next.js `16.2.11` configuration: `Geist` and `Geist_Mono` from
   `next/font/google` in the root layout, their previous generated CSS
   variables, and the previous raw lifecycle system stack
   (`system-ui`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, sans-serif);
2. remove Google Sans preload/inline owners from the App Router, global error,
   and raw lifecycle renderer as part of the same revert, without touching
   persisted data;
3. rebuild with Google Fonts network access available and rerun typography,
   localization, accessibility, performance, and production smoke on one exact
   rollback SHA;
4. deploy the rollback, wait for `READY`, and prove deployed HTML/CSS no longer
   references Google Sans;
5. remove now-unreferenced Google Sans assets only in a separate reviewed
   cleanup after the deployed rollback is proven.

Never delete shared font assets before deployed references have disappeared.

## Downstream Contract

OVE-202 is the direct downstream typography owner. It is hard-dependent on the
exact OVE-208 commit contained in `main` and on this contract; its Linear and
closeout evidence must name that exact final SHA rather than the pre-change
baseline SHA recorded above.

The structured composer holder, toolbar, popovers, portals, contenteditable
authoring surface, and read-only SSR
projection must all inherit `--font-overgarden-sans` through the shared
`font-sans` token. Formatted prose uses the pinned true Italic rather than
synthesis. Every authoring and read-only document preserves the known `uk`,
`bg`, or `ru` `lang` context so Bulgarian localized forms continue to shape
correctly.

OVE-202 must not:

- add a second font loader, `@font-face` owner, runtime CDN request, or
  editor-only typography stylesheet;
- add an editor-specific font-family tool or user typography preference;
- serialize `font-family`, font URLs, or implementation-specific font tokens
  into the canonical structured document or persisted HTML.

OVE-202 browser evidence must exercise authoring and read-only SSR in all three
locales, including representative IME input and toolbar/popover/portal states.
It must assert computed family inheritance and, in Chromium,
`CSS.getPlatformFontsForNode` evidence for the actual rendered Google Sans face,
not just the CSS family name. Consumption is documented in
`docs/STRUCTURED_JOURNAL_COMPOSER.md`; the composer holder uses `font-sans` only.

OVE-206 reorder and OVE-207 cover behavior inherit this typography contract
transitively through OVE-202. They must preserve the same editor and portal
inheritance while adding no typography owner; they do not require separate
direct OVE-208 dependencies.

Email, PDF, canvas, SVG text, and generated social-image embedding remain
explicit non-browser non-goals for OVE-208. Transactional email keeps robust
mail-client system fallbacks.

## Cyrillic Fallback Metrics (OVE-233)

One `size-adjust` cannot serve both scripts. Measured from the shipped binaries
with `calculateMetricCompatibleFallback`:

| Corpus   | Arial   | Google Sans | Required size-adjust |
| -------- | ------- | ----------- | -------------------- |
| Latin    | 934.51  | 463.40      | 101.55%              |
| Cyrillic | 1054.21 | 507.19      | 98.53%               |

The Latin-derived 101.55% rendered Cyrillic fallback text about 3% too wide.
Every OverGarden locale is Cyrillic, so the mistuning affected real first
paints, not just the probed route. `google-sans.css` therefore carries a second
fallback face with Cyrillic-derived metrics and an explicit `unicode-range`,
declared after the default face so it wins for Cyrillic code points. The asset
verifier recomputes both sets from the shipped binary, so they cannot drift.

The fallback face prioritizes direct `Liberation Sans` and `Arimo` names, in
family, full-name, and PostScript spellings, before the `Arial` alias. Arial is
absent on Linux and on some Android builds; direct names prevent Chromium Linux
from resolving an alias before it applies the fallback face's metric overrides.

## Browser-Timeline Fallback Gate (OVE-245)

Every fallback code is a direct CI failure. The evaluator has no engine
allowlist, suppression field, tolerance, or pass branch.

The probe records first contentful paint, meaningful-text visibility after
`DOMContentLoaded`, the browser high-resolution interval while the intercepted
font is blocked, a separate font-resource timing entry, and font-window CLS.
Node timestamps only coordinate the deterministic 600ms release gate; they are
not emitted or admitted as pass/fail evidence. Missing browser visibility or
font-resource timing fails closed.

### Scheduler-sensitive repeat (OVE-340)

Four fallback codes compare a clock against a bound: `fallback-fcp-after-1s`,
`fallback-not-visible-within-1s`, `fallback-delay-window`, and
`fallback-duration`. A loaded shared CI runner can miss one of them while the
product is correct, so a case whose failures are *all* four-list codes is
re-measured, at most `FALLBACK_CASE_MAX_ATTEMPTS` times, and every attempt is
kept on the case result as `attemptFailures`.

This is not a tolerance and not a pass branch. No bound moves, no code is
suppressed, and the full evaluator runs on every attempt. A case carrying any
other code — computed family, blocked request, resource timing, convergence,
fonts-ready, CLS, page error, console error — is final on its first attempt, and
so is a code the evaluator gains later, because membership in the four-list is
decided by exact string. Adding a member weakens the gate and needs a
measurement showing the product is correct while the runner still reports the
failure.

Run the self-contained local matrix from a clean preview:

```bash
cd apps/web
../../infra/run-with-local-infra-env pnpm test:typography-browser-local -- --browsers chromium,firefox,webkit --sha "$(git rev-parse HEAD)"
```

The command verifies the seeded local visual fixtures, builds the current
checkout, starts a loopback preview, waits boundedly for root and fixture HTTP
health, runs the existing matrix, and terminates the preview process group even
after a failure.
