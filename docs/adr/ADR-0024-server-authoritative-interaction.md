# ADR-0024 — Interaction, language, and sign-in are platform primitives, not hand-written client protocols

- **Status:** Accepted and implemented (OVE-376 – OVE-379, 2026-09-04)
- **Date:** 2026-09-04
- **Decision owner:** founder/owner
- **Linear:** project "SDD Slice 22 — Server-Authoritative Interaction, Language And Sign-In"
- **Relates to:** ADR-0022 D4 and D6, ADR-0023. Supersedes nothing.

## Context

On 2026-09-04 the owner reported four things: clicking Like broke the page,
changing the language took a long time and refused while anything else was
happening, it announced "Меняем язык…" while doing so, and the sign-in form
looked different depending on which control had asked for it.

Reproduced against production the same day, they were three defects, and each
had the same shape underneath.

**Like answered `500` with an empty body on 7 of the 8 public journal entries.**
`issueAnonymousLikeCapability` put `target_ref` verbatim into a signed token;
`hashAnonymousEngagementToken` rejected any token past 256 characters; a
Cyrillic letter is two UTF-8 bytes and base64url adds a third on top. Every
realistic Bulgarian or Ukrainian slug overflowed a bound the server itself had
minted past. The reader landed on a blank white page at the API URL.

Underneath that, the feature was not a like. `engagement_likes` held only
`anonymous_device_hash`, so a signed-in gardener's like was not theirs. The
count required `capability_expires_at > now()` and the toggle never refreshed
it, so every like stopped counting 24 hours after it was cast and the next like
to the same target deleted the row. `engagement_like_target_budgets` capped a
target at 64 in a CHECK constraint and again in code.

**Changing the language ran a two-phase distributed commit.** 1 938 lines across
three files: `prepare()` waiting on registered participants with a 2 250 ms
budget, `sealForDocumentReplacement()` with another, two commit gates, a `POST`,
then a full document replacement behind a `pagehide`/`pageshow` handshake. It
replaced the global `fetch`, so any non-GET request anywhere disabled the
control; it watched `input` across the whole document, so one keystroke raised a
discard dialog — before a reload destroyed that text anyway. The correct
behaviour was already written and switched off: the menu item carried the right
href and `onClick` called `preventDefault()` on it.

**Fourteen pages embedded the sign-in form**, each with its own chrome. Google
rendered on two of them because `googleSignInEnabled` defaults to false; ten did
not pass `postAuthPath`, so signing in from the feed landed the reader in the
workspace. Neither was an oversight anybody could catch in a diff.

ADR-0022 D6 had already removed this pattern once, under the names
"document-mutation admission", "signed generations", and "mutation registry".
The capability token was an admission token; the locale coordinator was a
mutation registry. Both had come back under other names.

## Decisions

### D1. A like is a permanent row with exactly one owner

`engagement_likes` carries nullable `user_id` and `visitor_id` with a check that
exactly one is set, and one partial unique index per owner column. A signed-in
gardener's like belongs to the account and survives devices. A signed-out
reader's like rests on one signed site-wide visitor cookie, minted only when
somebody first likes something and never before, and claimed onto the account at
sign-up. Both are permanent and uncapped.

Trust is decided at read time, not write time: the public count shows both
halves, and any future ranking reads only the `user_id` half. Requiring an
account to like would have been simpler and would have thrown away data that
cannot be recovered later — on a product whose readers arrive from search and
mostly never sign in.

The honest limit, stated so nobody rediscovers it: a reader who clears cookies
can like the same entry again. That is true of every anonymous counter on the
web. The answer is that the anonymous half never drives ranking, not a budget
table that punishes popularity.

### D2. The existing like rows were deleted, by explicit sign-off

`anonymous_device_hash` is derived from a token scoped to one target and held in
someone's browser: it names neither a person nor a device the schema can reach,
so no conversion exists. Migration `0049` deletes them. Its rollback restores
the columns and states that it cannot restore the rows. `AGENTS.md` rule 10
sign-off was given explicitly on 2026-09-04.

### D3. A control on a public page may not depend on hydration

This is the rule the slice cost the most to learn, and it was learned by
breaking it.

React gives a `<form>` a real endpoint only when its `action` is a Server Action
reference, or the `formAction` that `useActionState` derives from one. Wrap the
action in any client closure — to add an optimistic update, a refresh, a
callback — and React renders
`action="javascript:throw new Error('React form unexpectedly submitted.')"`, a
placeholder it replaces on hydration and never before. The first version of the
like control did exactly that while its pull request claimed the forms still
posted without JavaScript. They did not.

Every interaction control, the sign-in screen, and the language control now pass
the action reference straight through, and each has a source-level test that
fails if a closure comes back. The test reads the source deliberately: outside
Next's pipeline every form renders the placeholder, so a rendered-HTML assertion
cannot tell the correct shape from the broken one.

The corollary bites in more places than forms. A popup menu renders its items
only once it opens, so the language options were absent from the server HTML;
the control is a `<details>` disclosure now, and the anchors ship in the
document.

**What this rule does not claim, measured on 2026-09-04.** "A real endpoint" is
not "reachable with JavaScript off". Every public page renders inside streamed
Suspense boundaries, so its markup arrives in `<div hidden id="S:n">` and only
React's inline completion script moves it into place. With scripts disabled a
public page shows nothing at all — 0 visible characters, on a journal entry,
the feed, knowledge and objects alike — and `<title>` and the metadata sit after
`</head>` in the body stream. Two tools agree: raw HTML byte offsets and a
Chromium context with `javaScriptEnabled: false`.

This is the app's rendering architecture, not something this slice introduced,
and Next's own bot handling already covers the cases that matter: agents that do
not run scripts (`facebookexternalhit`, Slackbot, Telegrambot, WhatsApp) receive
a fully blocking render with the title in `<head>`, while Googlebot receives the
stream because it executes scripts. What the rule buys is therefore narrower and
still worth having: the control posts to a real endpoint the moment it is
reachable, and never depends on hydration to *act* once rendered.

### D4. Choosing a language is a navigation

On a public page the locale is in the path, so the choice is a link, and the
proxy writes the preference from the prefix it lands on — now on RSC navigations
as well as document loads, so a soft switch persists immediately.

Hovering a link must not change what language somebody is reading in, and the
proxy alone cannot deliver that. Next strips `Next-Router-Prefetch` and its
siblings before middleware runs, so a router prefetch of `/ru/…` reaches the
proxy looking exactly like a reader landing there. The header checks in
`isPrefetchRequest` catch only browser-initiated speculation (`Purpose`,
`Sec-Purpose`), which the App Router does not send. The guarantee therefore lives
on the link: cross-locale options carry `prefetch={false}`, and
`language-switcher.test.tsx` fails if that is removed. This was found by
verification after the slice shipped — hovering "Русский" on a `/bg/` page did
rewrite the saved language — and is recorded here rather than quietly patched.

On a route with no locale prefix the choice is a form over a Server Action that
writes the cookie. Nothing replaces the document, so text typed into a composer
survives a language change. No status message and no confirmation dialog exist,
because there is no delay to explain and nothing to discard.

### D5. There is one sign-in screen

`/auth/sign-in` and `/auth/sign-up` over one component and Server Actions on
`auth.api.*`. Separate routes rather than two submit buttons on one set of
fields: a reader could not tell which action they were performing, and
`current-password` and `new-password` cannot both be correct on one field.

One screen is only worth having if one function addresses it. It did not, at
first: every caller assembled its own `"/auth/sign-in?next=" +
encodeURIComponent(...)`, and the site header assembled nothing at all — it read
the navigation item's *label* and hard-coded `href="/garden"` beside it, so
pressing "sign in" landed on the workspace empty state, which offers a second
"sign in" before the form. The owner found it the day after this shipped.
`buildSignInHref` is the only place that spells the destination now, and
`single-sign-in-surface.test.ts` fails if any other module writes one.

`?next=` decides where the reader lands, through the same same-origin boundary
every other return path uses, and it names the *thing*, not the page that
contains it: the header carries the reader's current page, and an intent control
carries the resume href the intent contract builds, so signing in from "new
entry" arrives at `/garden?authIntent=create_entry#first-entry-composer` with the
composer in front of the reader. `ACTION_ANCHORS` had always known where each
action belongs; nothing was carrying it, so the reader paid one press to sign in
and another to find the composer. `?intent=` decides only the heading, from the
closed action set — a value in the address may not change which providers,
fields, or controls exist. `/auth/intent` is a redirect; its signed token and
`/auth/intent/resume` are unchanged, so resuming a comment or a follow does not
regress. Every other page renders its own empty state and one link.

## What shipping it taught

**A measurement from one tool is not a finding.** A preview browser reported
that public pages hydrate nothing below the shell. That was filed as an urgent
defect and written into four source files as fact. It does not reproduce: a real
Chromium, against both a local production build and production, hydrates `main`,
the like control and the language control and leaves no postponed template
unresolved. Flagging the uncertainty was right; acting on it before the second
browser was not. `tests/public-hydration.spec.ts` keeps the question answered.

**The same mistake arrived three times.** Wrapping `formAction` in a closure cost
a production defect on the like, was caught in review on the sign-in screen, and
was caught by the author's own pre-flight check on the language control. Only
the third one was cheap. The source-level tests exist because the shape is
invisible in a render.

**A guard that reads one file cannot see the file that is wrong.** The check
that was supposed to keep "sign in" and "my garden" apart asserted that the
*navigation module* contained the string `"/auth/sign-in"`. It did, and the
header still shipped `href="/garden"` next to the label it read from that same
module. The replacement reads every source file and allows the destination to be
spelled in one of them.

**A guard is not a guarantee until the runtime is asked.** `isPrefetchRequest`
read exactly the headers the App Router sends, its unit test passed, and it never
fired in production: Next removes those headers before middleware. Two probes
that differed only in headers exposed it, and a real browser confirmed the
consequence. A predicate over request headers is only as true as a measurement of
what the runtime actually forwards.

**A tombstone must not carry the identity of what is gone.** The first version of
the language form on the 410 page copied the current path into a hidden
`returnTo`. The suite caught it. The endpoint's fallback is the home page.

## Consequences

Roughly 7 000 lines removed against 2 500 added. Deleted: the locale change
coordinator and its boundary, the `window.fetch` patch, the document-wide input
observer, the anonymous like capability, the per-target budget table, the
24-hour expiry, the 64-like ceiling, all seven `/api/engagement/*` handlers, the
`?engagement=` status vocabulary for the panel, `GardenAuthPanel` and its
fourteen embeddings, the second sign-in surface, and a 110-line inline protocol
in the raw lifecycle document.

The costs are real and accepted. Anonymous likes are softer than account likes
and must never drive ranking. One migration deletes rows. A `<details>` control
has weaker keyboard semantics than a popup menu, which is the price of the
options existing before JavaScript runs.

Falsified if: a public control ships that needs hydration to act, or a like is
found to expire, or a second surface starts asking for a password. On
falsification, extend the source-level shape tests rather than adding a second
mechanism.
