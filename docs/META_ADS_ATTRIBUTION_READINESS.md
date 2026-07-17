# Meta Ads Attribution Readiness

OVE-144 adds consent-first Meta Ads attribution for MVP launch learning. It is not the primary growth engine. Product research still treats paid acquisition as risky until retention and activation are proven, so Meta Ads must stay a bounded learning channel with a stop condition, not a scale-up assumption.

## Source Checks

Checked on 2026-07-05:

- Meta Pixel GDPR consent controls: `https://developers.facebook.com/docs/meta-pixel/implementation/gdpr`
- Meta Pixel + Conversions API deduplication: `https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events`
- Meta Conversions API customer information parameters: `https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters/`

Implementation decisions from those checks:

- Do not load Meta Pixel before explicit marketing consent.
- Use a shared event id for Pixel `eventID` and CAPI `event_id` when both are active.
- Do not use Advanced Matching or send CAPI customer information parameters for MVP. The CAPI payload carries an empty `user_data` object by design. If Meta requires identifiers that conflict with OverGarden privacy boundaries, keep CAPI disabled rather than weakening the boundary.

## Environment

Required names:

- `NEXT_PUBLIC_META_MARKETING_MEASUREMENT_ENABLED`: single kill switch. Must be `true`, `1`, or `yes` before any Meta marketing measurement can run.
- `NEXT_PUBLIC_META_PIXEL_ID`: public Meta Pixel/Data Source id from Meta Events Manager.
- `META_CONVERSIONS_API_ACCESS_TOKEN`: secret token generated for the Pixel/Data Source in Meta Events Manager.
- `META_CONVERSIONS_API_TEST_EVENT_CODE`: optional Test Events code for redacted smoke.
- `META_CONVERSIONS_API_GRAPH_VERSION`: optional Graph API version. The code default is `v23.0`; re-check Meta before live campaign launch if the dashboard recommends a newer version.

Facebook Login uses `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`, and `FACEBOOK_LOGIN_PUBLIC_READY`. Those are intentionally separate from Meta Ads measurement.

## Consent Behavior

- No marketing consent means no Meta Pixel script and no Conversions API request.
- Consent is not prechecked.
- Decline keeps Meta measurement off.
- The `/privacy` page exposes a revoke control. Turning it off calls Pixel consent revoke for the current page and stops future Meta CAPI calls from this browser.
- Meta Pixel is scoped to authored public, legal, and support pages only. It is not loaded on private garden, admin/operator, auth, join/invite, erasure, journal, lineage, API, or callback routes.

## Event Allowlist

Allowed event classes:

- `landing_page_view`
- `signup_started`
- `account_created`
- `first_entry_saved`
- `return_visit`
- `invite_requested`

Currently wired events:

- `landing_page_view`: public routes only, after marketing consent; Pixel + CAPI can dedupe through the same event id.
- `signup_started`: when a visitor starts email sign-up; CAPI only, no email or form values.
- `first_entry_saved`: after the first private garden entry is saved; CAPI only, no journal text, plant name, catalog selection, media, location, account id, or route.

`account_created` remains allowlisted but is intentionally unwired. With
enumeration-resistant email sign-up, the client cannot distinguish a newly
created unverified account from a generic response for an existing email, so a
successful client response must never emit this event. Wire it only from a
future server-authoritative, consent-preserving proof of actual creation.
`return_visit` and `invite_requested` also remain allowlisted for later vertical
slices but are not wired in OVE-144.

## Forbidden Meta Payload Data

Never send:

- journal title/body/comments;
- private plant/object/catalog names or selections;
- precise location, GPS, EXIF, or sub-region evidence;
- media keys, original/derivative URLs, upload URLs, or media metadata;
- Better Auth ids, provider ids, emails, phones, cookies, callback params, invite/reset/verification tokens, or access tokens;
- IP address, user-agent values, raw URLs, referrers, query strings, private route paths, admin/operator route evidence;
- Meta `fbp`/`fbc` cookies or Advanced Matching identifiers.

## Test Events Smoke

Before enabling real campaign traffic:

1. Add the env values in Vercel with `NEXT_PUBLIC_META_MARKETING_MEASUREMENT_ENABLED=false`.
2. Add a temporary `META_CONVERSIONS_API_TEST_EVENT_CODE` from Meta Events Manager > Test Events.
3. Deploy.
4. Flip only the public kill switch to `true` for the smoke window.
5. Open a public route, confirm no Pixel before consent, accept marketing measurement, and confirm the public event class appears in Meta Test Events.
6. Save one first private entry as a smoke user and confirm only `first_entry_saved` appears by class.
7. Turn the public kill switch back off unless the campaign is intentionally starting.

Evidence may record only event class, route class, consent state, and success/failure class. Do not paste token values, test codes, Meta cookies, user ids, emails, IP/user-agent values, raw URLs, or event payloads with user-level data.

## First Campaign Rule

The useful optimization target is `first_entry_saved`, because it is closest to OverGarden activation. If volume is too low for Meta delivery learning, `signup_started` may be used only as a temporary top-of-funnel learning event; it must not be treated as product validation.

Do not optimize MVP learning on `landing_page_view` except for a technical smoke campaign. Page views prove ad delivery, not garden activation.

## Stop Conditions

Stop or pause the campaign if any of these happen:

- Meta Test Events cannot prove class-only delivery without forbidden identifiers.
- Pixel or CAPI fires before explicit marketing consent.
- Private route paths, journal data, location data, media data, account identifiers, auth data, IP/user-agent values, Meta cookies, or raw URLs/referrers appear in any Meta-bound payload/evidence.
- Spend reaches the operator-defined test cap before producing consented `first_entry_saved` events.
- `signup_started` rises but `first_entry_saved` does not, because that indicates ad curiosity without product activation.
- Retained garden behavior does not follow first entry saves; paid sign-ups without journaling are not a launch success signal.

Until a concrete campaign brief defines the test cap, audience, creative, and minimum activation readout, keep `NEXT_PUBLIC_META_MARKETING_MEASUREMENT_ENABLED=false`.
