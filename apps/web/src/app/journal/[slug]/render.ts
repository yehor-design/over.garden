import {
  publicJournalEntryPath,
  publicVarietyPath,
} from "@/lib/garden/public-paths";
import {
  buildAuthIntentAnchor,
  type AuthIntentAction,
} from "@/lib/auth/auth-intent-contract";
import { getCoarseRegionLabel } from "@/lib/garden/regions";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatPublicCount,
  getPublicSurfaceCopy,
} from "@/lib/public-surface-localization";
import type { PublicJournalEntryPage } from "@/server/journal-repository";
import type {
  EngagementTarget,
  PublicEngagementSummary,
} from "@/server/engagement-repository";
import { createAuthIntentControlRef } from "@/server/auth-intent-control";
import {
  evaluatePublicSurfaceIndexability,
  formatRobotsMetaContent,
} from "@/server/public-surface-indexing-policy";
import {
  getSiteShellNavigation,
  getSiteShellRouteContext,
  isSiteShellItemActive,
  type SiteShellNavigationItem,
} from "@/lib/site-shell-navigation";

// Pure HTML renderers for the public journal route. They live in their own
// module so the public-facing bytes can be unit/privacy tested without the
// Next.js route runtime. The route handler only adds the HTTP response shell.

export function renderPublicJournalEntryHtml(
  page: PublicJournalEntryPage,
  engagement?: PublicEngagementSummary,
  engagementStatus?: string | null,
  locale: InterfaceLocale = "uk",
  isAuthenticated = false,
  resumeAction: AuthIntentAction | null = null,
  resumeControl: string | null = null,
  directoryReturnTo: string | null = null,
) {
  const copy = getPublicSurfaceCopy(locale);
  const title = `${page.entry.title} · ${copy.journal.metadataTitleSuffix} | OverGarden`;
  const description = summarize(page.entry.body);
  const robots = formatRobotsMetaContent(
    evaluatePublicSurfaceIndexability({
      kind: "journal_entry",
      publicNoindex: page.entry.publicNoindex,
    }),
  );
  const locationLabel = getPublicJournalLocationLabel(page, locale);
  const varietyLink = getPublicVarietyLink(page, locale);
  const entryContextLabel =
    page.entry.entryScope === "space"
      ? `${copy.journal.spaceEntryPrefix} · ${page.space.displayName}`
      : page.plantObject.displayName;
  const objectPassportPath = page.plantObject.publicPath;
  const guestStartPath = gardenJournalEntryActivationPath(
    page.entry.publicSlug,
  );

  return renderShell({
    title,
    description,
    robots,
    canonicalPath: publicJournalEntryPath(page.entry.publicSlug),
    locale,
    isAuthenticated,
    body: `
      <main class="page logbook-page">
        <nav class="topbar" aria-label="${escapeAttribute(copy.journal.primaryNavigation)}">
          <a class="button secondary" href="${escapeAttribute(directoryReturnTo ?? localizedJournalDirectoryPath(locale))}">${escapeHtml(copy.journal.backToJournals)}</a>
          ${objectPassportPath ? `<a class="button secondary" href="${escapeAttribute(objectPassportPath)}">${escapeHtml(copy.journal.objectPassport)}</a>` : ""}
        </nav>
        <header class="hero">
          <div class="hero-copy">
            <p class="eyebrow">${escapeHtml(copy.journal.entryType)}</p>
            <h1>${escapeHtml(page.entry.title)}</h1>
            <p class="dek">${escapeHtml(entryContextLabel)}${page.entry.entryScope === "object" && page.plantObject.varietyText ? ` · ${escapeHtml(page.plantObject.varietyText)}` : ""}</p>
            <div class="meta" aria-label="${escapeAttribute(copy.journal.entryMetadata)}">
              <time>${escapeHtml(formatDate(page.entry.entryDate, locale))}</time>
              <span>${escapeHtml(page.entry.entryScope === "space" ? copy.journal.spaceLogbook : copy.journal.objectLogbook)}</span>
              ${locationLabel ? `<span>${escapeHtml(locationLabel)}</span>` : `<span>${escapeHtml(copy.journal.locationHidden)}</span>`}
            </div>
            <div class="action-row">
              ${
                objectPassportPath
                  ? `<a class="button" href="${escapeAttribute(objectPassportPath)}">${escapeHtml(copy.journal.openObjectPassport)}</a>`
                  : ""
              }
              <a class="button secondary" href="${escapeAttribute(guestStartPath)}">${escapeHtml(copy.journal.startComparableJournal)}</a>
            </div>
          </div>
          <aside class="context-card" aria-labelledby="journal-context-title">
            <h2 id="journal-context-title">${escapeHtml(copy.journal.journalContext)}</h2>
            <dl class="fact-list">
              ${renderFact(page.entry.entryScope === "space" ? copy.journal.space : copy.journal.livingObject, page.entry.entryScope === "space" ? page.space.displayName : page.plantObject.displayName)}
              ${renderFact(copy.journal.catalogIdentity, getCatalogContextLabel(page, locale))}
              ${renderFact(copy.journal.publicLocation, locationLabel ?? copy.journal.hidden)}
              ${renderFact(copy.journal.caretaker, page.author?.displayName ?? copy.journal.defaultCaretaker)}
            </dl>
          </aside>
        </header>
        <article class="article" aria-label="${escapeAttribute(copy.journal.journalEntry)}">
          ${
            page.media
              ? `<img class="photo" src="${escapeAttribute(page.media.publicUrl)}" alt="${escapeAttribute(`${page.entry.title} photo`)}" width="960" height="540" />`
              : ""
          }
          <div class="article-body">
            <p class="section-label">${escapeHtml(copy.journal.entryNote)}</p>
            <p>${escapeHtml(page.entry.body).replaceAll("\n", "<br />")}</p>
          </div>
        </article>
        ${renderRelatedPublicContext(page, varietyLink, locale)}
        ${
          engagement
            ? renderEngagementHtml({
                target: engagement.target,
                summary: engagement,
                returnTo: publicJournalEntryPath(page.entry.publicSlug),
                status: engagementStatus,
                locale,
                isAuthenticated,
                resumeAction,
                resumeControl,
              })
            : ""
        }
      </main>
    `,
  });
}

export function getPublicJournalLocationLabel(
  page: PublicJournalEntryPage,
  locale: InterfaceLocale = "uk",
) {
  const copy = getPublicSurfaceCopy(locale);
  if (page.entry.entryScope === "space") {
    if (page.space.locationVisibility !== "region") return null;
    const label = getCoarseRegionLabel(page.space.coarseRegionCode);
    return label ? `${copy.journal.regionPrefix}: ${label}` : null;
  }

  if (page.plantObject.locationVisibility !== "region") return null;

  const code =
    page.plantObject.coarseRegionCode ??
    (page.space.locationVisibility === "region"
      ? page.space.coarseRegionCode
      : null);
  const label = getCoarseRegionLabel(code);

  return label ? `${copy.journal.regionPrefix}: ${label}` : null;
}

export function renderGoneJournalEntryHtml(
  publicSlug: string,
  locale: InterfaceLocale = "uk",
  isAuthenticated = false,
) {
  const copy = getPublicSurfaceCopy(locale);

  return renderShell({
    title: `${copy.journal.entryRemoved} | OverGarden`,
    description: copy.journal.entryRemovedDescription,
    robots: "noindex, nofollow",
    canonicalPath: publicJournalEntryPath(publicSlug),
    locale,
    isAuthenticated,
    body: `
      <main class="page">
        <header class="header">
          <h1>${escapeHtml(copy.journal.entryRemoved)}</h1>
          <p class="body-copy">${escapeHtml(copy.journal.entryRemovedDescription)}</p>
        </header>
      </main>
    `,
  });
}

export function renderNotFoundJournalEntryHtml(
  locale: InterfaceLocale = "uk",
  isAuthenticated = false,
) {
  const copy = getPublicSurfaceCopy(locale);

  return renderShell({
    title: `${copy.journal.entryNotFound} | OverGarden`,
    description: copy.journal.entryNotFoundDescription,
    robots: "noindex, nofollow",
    locale,
    isAuthenticated,
    body: `
      <main class="page">
        <header class="header">
          <h1>${escapeHtml(copy.journal.entryNotFound)}</h1>
          <p class="body-copy">${escapeHtml(copy.journal.entryNotFoundDescription)}</p>
        </header>
      </main>
    `,
  });
}

function renderFact(label: string, value: string) {
  return `
    <div class="fact">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `;
}

function getCatalogContextLabel(
  page: PublicJournalEntryPage,
  locale: InterfaceLocale,
) {
  if (page.plantObject.catalogCanonicalName) {
    return page.plantObject.catalogCanonicalName;
  }

  if (page.plantObject.varietyText) {
    return page.plantObject.varietyText;
  }

  const copy = getPublicSurfaceCopy(locale);

  return page.entry.entryScope === "space"
    ? copy.journal.spaceLevelUpdate
    : copy.journal.catalogMatchPending;
}

function renderRelatedPublicContext(
  page: PublicJournalEntryPage,
  varietyLink: string | null,
  locale: InterfaceLocale,
) {
  const copy = getPublicSurfaceCopy(locale);
  const contextLinks = [
    page.plantObject.publicPath
      ? renderContextLink({
          label: copy.journal.objectPassport,
          value: page.plantObject.displayName,
          href: page.plantObject.publicPath,
        })
      : null,
    varietyLink
      ? renderContextLink({
          label: copy.journal.catalogMatch,
          value:
            page.plantObject.catalogCanonicalName ??
            page.plantObject.varietyText ??
            copy.journal.publicVariety,
          href: getPublicVarietyHref(page) ?? "",
        })
      : null,
    page.author
      ? renderContextLink({
          label: copy.journal.caretakerProfile,
          value: page.author.mention,
          href: page.author.profilePath,
        })
      : null,
  ].filter(Boolean);

  const relatedEntries = page.relatedEntries
    .map(
      (entry) => `
        <li>
          <a class="related-entry" href="${escapeAttribute(entry.publicPath)}">
            <span>${escapeHtml(formatDate(entry.entryDate, locale))}</span>
            <strong>${escapeHtml(entry.title)}</strong>
            <small>${escapeHtml(entry.bodyPreview)}</small>
          </a>
        </li>
      `,
    )
    .join("");

  if (contextLinks.length === 0 && !relatedEntries) return "";

  return `
    <section class="related-context" aria-labelledby="related-context-title">
      <div>
        <p class="section-label">${escapeHtml(copy.journal.relatedPublicContext)}</p>
        <h2 id="related-context-title">${escapeHtml(copy.journal.followObjectHistory)}</h2>
      </div>
      ${
        contextLinks.length > 0
          ? `<div class="context-link-grid">${contextLinks.join("")}</div>`
          : ""
      }
      ${relatedEntries ? `<ol class="related-list">${relatedEntries}</ol>` : ""}
    </section>
  `;
}

function renderContextLink({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href: string;
}) {
  if (!href) return null;

  return `
    <a class="context-link" href="${escapeAttribute(href)}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </a>
  `;
}

function getPublicVarietyLink(
  page: PublicJournalEntryPage,
  locale: InterfaceLocale,
) {
  const href = getPublicVarietyHref(page);
  if (!href) return null;

  const label =
    page.plantObject.catalogCanonicalName ??
    page.plantObject.varietyText ??
    getPublicSurfaceCopy(locale).journal.variety;

  return `<a class="inline-link" href="${escapeAttribute(href)}">${escapeHtml(label)}</a>`;
}

function getPublicVarietyHref(page: PublicJournalEntryPage) {
  if (!page.plantObject.catalogPublicSlug) return null;

  return publicVarietyPath(page.plantObject.catalogPublicSlug);
}

function gardenJournalEntryActivationPath(publicSlug: string) {
  const params = new URLSearchParams({
    source: "public-journal",
    entry: publicSlug,
  });

  return `/garden?${params.toString()}`;
}

function localizedJournalDirectoryPath(locale: InterfaceLocale) {
  return locale === "uk" ? "/journals" : `/${locale}/journals`;
}

function renderEngagementHtml({
  target,
  summary,
  returnTo,
  status,
  locale,
  isAuthenticated,
  resumeAction,
  resumeControl,
}: {
  target: EngagementTarget;
  summary: PublicEngagementSummary;
  returnTo: string;
  status?: string | null;
  locale: InterfaceLocale;
  isAuthenticated: boolean;
  resumeAction: AuthIntentAction | null;
  resumeControl: string | null;
}) {
  const copy = getPublicSurfaceCopy(locale);
  const intentTarget = engagementAuthIntentTarget(target);

  return `
    <section id="comments" class="engagement"${resumeAction ? ` data-auth-intent-resumed="${escapeAttribute(resumeAction)}"` : ""}>
      <div class="engagement-actions">
        <div class="action-row">
          ${renderActionForm({
            action: "/api/engagement/likes",
            target,
            returnTo,
            label: copy.engagement.like,
          })}
          ${
            isAuthenticated
              ? renderActionForm({
                  action: "/api/engagement/bookmarks",
                  target,
                  returnTo,
                  label: copy.engagement.bookmark,
                  intentAction: "bookmark",
                  autoFocus: resumeAction === "bookmark" && !resumeControl,
                })
              : renderAuthIntentForm({
                  action: "bookmark",
                  target: intentTarget,
                  returnTo,
                  label: copy.engagement.bookmark,
                })
          }
        </div>
        <p class="muted">${escapeHtml(formatLikeCount(summary.activeLikeCount, locale))}</p>
      </div>
      ${status ? `<p class="muted">${escapeHtml(engagementStatusMessage(status, locale))}</p>` : ""}
      ${resumeAction === "comment" || resumeAction === "bookmark" ? `<p class="intent-resumed" role="status">Sign-in complete. Confirm the action below to continue.</p>` : ""}
      ${
        isAuthenticated
          ? `<form method="post" action="/api/engagement/comments" class="comment-form">
              ${renderTargetFields(target, returnTo)}
              <label>
                <span>${escapeHtml(copy.engagement.comment)}</span>
                <textarea id="engagement-comment" data-auth-intent-control="comment"${resumeAction === "comment" && !resumeControl ? " autofocus" : ""} name="body" maxlength="600" rows="3"></textarea>
              </label>
              <button class="button" type="submit">${escapeHtml(copy.engagement.comment)}</button>
            </form>`
          : renderAuthIntentForm({
              action: "comment",
              target: intentTarget,
              returnTo,
              label: copy.engagement.comment,
              className: "comment-intent",
            })
      }
      ${
        summary.comments.length === 0
          ? `<p class="muted">${escapeHtml(copy.engagement.noComments)}</p>`
          : `<ol class="comments">${summary.comments
              .map((comment) => {
                const replyControl = createAuthIntentControlRef(
                  "reply",
                  comment.replyToken,
                );
                const isResumedReply =
                  resumeAction === "comment" && resumeControl === replyControl;
                return `
                  <li class="comment">
                    <div class="comment-meta">
                      <strong>${escapeHtml(comment.authorLabel)}</strong>
                      <time>${escapeHtml(formatDate(comment.createdAt, locale))}</time>
                    </div>
                    ${comment.parentReplyToken ? `<p class="muted">${escapeHtml(copy.engagement.reply)}</p>` : ""}
                    <p>${escapeHtml(comment.body).replaceAll("\n", "<br />")}</p>
                    ${
                      isAuthenticated
                        ? `<form method="post" action="/api/engagement/comments" class="reply-form">
                            ${renderTargetFields(target, returnTo)}
                            <input type="hidden" name="parentCommentId" value="${escapeAttribute(comment.replyToken)}" />
                            <label>
                              <span>${escapeHtml(copy.engagement.reply)}</span>
                              <textarea${isResumedReply ? ` id="${escapeAttribute(buildAuthIntentAnchor("comment", replyControl))}" autofocus` : ""} data-auth-intent-control="comment" data-auth-intent-control-ref="${escapeAttribute(replyControl)}" name="body" maxlength="600" rows="2"></textarea>
                            </label>
                            <button class="button secondary" type="submit">${escapeHtml(copy.engagement.reply)}</button>
                          </form>`
                        : renderAuthIntentForm({
                            action: "comment",
                            target: intentTarget,
                            returnTo,
                            control: replyControl,
                            label: copy.engagement.reply,
                            className: "reply-intent",
                          })
                    }
                  </li>
                `;
              })
              .join("")}</ol>`
      }
      ${renderRawAuthIntentFocusScript(resumeAction, resumeControl)}
    </section>
  `;
}

function renderActionForm({
  action,
  target,
  returnTo,
  label,
  intentAction,
  autoFocus = false,
}: {
  action: string;
  target: EngagementTarget;
  returnTo: string;
  label: string;
  intentAction?: AuthIntentAction;
  autoFocus?: boolean;
}) {
  return `
    <form method="post" action="${escapeAttribute(action)}">
      ${renderTargetFields(target, returnTo)}
      <button${intentAction ? ` id="engagement-${escapeAttribute(intentAction)}" data-auth-intent-control="${escapeAttribute(intentAction)}"` : ""}${autoFocus ? " autofocus" : ""} class="button" type="submit">${escapeHtml(label)}</button>
    </form>
  `;
}

function renderAuthIntentForm({
  action,
  target,
  returnTo,
  label,
  className = "",
  control,
}: {
  action: "comment" | "bookmark";
  target: { kind: "journal" | "object" | "collection"; ref: string };
  returnTo: string;
  label: string;
  className?: string;
  control?: string;
}) {
  return `
    <form method="post" action="/auth/intent/start" class="${escapeAttribute(className)}">
      <input type="hidden" name="action" value="${escapeAttribute(action)}" />
      <input type="hidden" name="returnTo" value="${escapeAttribute(returnTo)}" />
      <input type="hidden" name="targetKind" value="${escapeAttribute(target.kind)}" />
      <input type="hidden" name="targetRef" value="${escapeAttribute(target.ref)}" />
      ${control ? `<input type="hidden" name="control" value="${escapeAttribute(control)}" />` : ""}
      <button class="button${action === "bookmark" ? " secondary" : ""}" data-auth-intent-control="${escapeAttribute(action)}"${control ? ` data-auth-intent-control-ref="${escapeAttribute(control)}"` : ""} type="submit">${escapeHtml(label)}</button>
    </form>
  `;
}

function renderRawAuthIntentFocusScript(
  action: AuthIntentAction | null,
  control: string | null,
) {
  if (!action) return "";
  const selector = control
    ? `[data-auth-intent-control="${action}"][data-auth-intent-control-ref="${control}"]`
    : `[data-auth-intent-control="${action}"]`;

  return `<script data-auth-intent-focus-script="true">requestAnimationFrame(()=>{const target=document.querySelector(${JSON.stringify(selector)});if(target instanceof HTMLElement){target.focus({preventScroll:true});target.scrollIntoView({block:"center"});}});</script>`;
}

function engagementAuthIntentTarget(target: EngagementTarget) {
  if (target.kind === "journal_entry") {
    return { kind: "journal" as const, ref: target.ref };
  }
  if (target.kind === "lineage_object") {
    return { kind: "object" as const, ref: target.ref };
  }
  return { kind: "collection" as const, ref: target.ref };
}

function renderTargetFields(target: EngagementTarget, returnTo: string) {
  return `
    <input type="hidden" name="targetKind" value="${escapeAttribute(target.kind)}" />
    <input type="hidden" name="targetRef" value="${escapeAttribute(target.ref)}" />
    <input type="hidden" name="returnTo" value="${escapeAttribute(returnTo)}" />
  `;
}

function engagementStatusMessage(status: string, locale: InterfaceLocale) {
  const copy = getPublicSurfaceCopy(locale);

  switch (status) {
    case "liked":
      return copy.engagement.liked;
    case "unliked":
      return copy.engagement.unliked;
    case "like-rate-limited":
      return copy.engagement.likeRateLimited;
    case "bookmarked":
      return copy.engagement.bookmarked;
    case "bookmark-removed":
      return copy.engagement.bookmarkRemoved;
    case "commented":
      return copy.engagement.commented;
    default:
      return "";
  }
}

function renderShell({
  title,
  description,
  robots,
  canonicalPath,
  body,
  locale,
  isAuthenticated,
}: {
  title: string;
  description: string;
  robots: string;
  canonicalPath?: string;
  body: string;
  locale: InterfaceLocale;
  isAuthenticated?: boolean;
}) {
  const pathname = canonicalPath ?? "/";
  const navigation = getSiteShellNavigation(locale, isAuthenticated ?? false);
  const context = getSiteShellRouteContext(pathname, locale);
  const publicNavigation = renderRawNavigationSection(
    navigation.labels.publicSection,
    navigation.publicItems,
    pathname,
  );
  const personalNavigation =
    navigation.personalItems.length > 0
      ? renderRawNavigationSection(
          navigation.labels.personalSection,
          navigation.personalItems,
          pathname,
        )
      : "";
  const mobileNavigation = renderRawMobileNavigation(
    navigation.mobileItems,
    pathname,
  );
  const sessionActions = isAuthenticated
    ? `<a class="site-shell-header-action primary" href="/garden#first-entry-composer">${escapeHtml(navigation.personalItems.find((item) => item.key === "add-update")?.label ?? "")}</a><a class="site-shell-header-action secondary-action" href="/garden/profile">${escapeHtml(navigation.labels.account)}</a>`
    : `<a class="site-shell-header-action primary" href="/garden">${escapeHtml(navigation.mobileItems.find((item) => item.key === "sign-in")?.label ?? "")}</a>`;

  return `<!doctype html>
<html lang="${escapeAttribute(locale)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeAttribute(description)}" />
    <meta name="robots" content="${escapeAttribute(robots)}" />
    ${canonicalPath ? `<link rel="canonical" href="${escapeAttribute(canonicalPath)}" />` : ""}
    <style>
      :root {
        color-scheme: light;
        --border: rgb(226 229 225);
        --muted: rgb(97 105 96);
        --text: rgb(22 26 22);
        --bg: rgb(255 255 255);
        --panel: rgb(255 255 255);
        --primary: rgb(29 95 56);
        --accent: rgb(235 244 236);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .site-shell {
        min-height: 100dvh;
      }
      .site-shell-header {
        position: sticky;
        z-index: 30;
        top: 0;
        height: 3.5rem;
        border-bottom: 1px solid rgb(255 255 255 / 0.12);
        background: var(--text);
        color: var(--bg);
      }
      .site-shell-header-inner {
        display: flex;
        width: min(100%, 80rem);
        height: 100%;
        margin: 0 auto;
        padding: 0 1.25rem;
        align-items: stretch;
      }
      .site-shell-brand {
        display: flex;
        width: 14rem;
        align-items: center;
        background: var(--primary);
        color: white;
        font-size: 0.9rem;
        font-weight: 700;
        padding: 0 1rem;
        text-decoration: none;
      }
      .site-shell-header-actions {
        display: flex;
        margin-left: auto;
        align-items: center;
        gap: 0.5rem;
        padding-left: 0.75rem;
      }
      .site-shell-header-action {
        border: 1px solid rgb(255 255 255 / 0.24);
        border-radius: 0.45rem;
        color: white;
        font-size: 0.8rem;
        font-weight: 600;
        padding: 0.4rem 0.65rem;
        text-decoration: none;
      }
      .site-shell-header-action.primary {
        border-color: var(--primary);
        background: var(--primary);
      }
      .site-shell-grid {
        display: grid;
        width: min(100%, 80rem);
        min-height: calc(100dvh - 3.5rem);
        margin: 0 auto;
      }
      .site-shell-sidebar,
      .site-shell-context {
        display: none;
      }
      .site-shell-content {
        min-width: 0;
        padding-bottom: 4.25rem;
      }
      .site-shell-section {
        display: grid;
        gap: 0.35rem;
      }
      .site-shell-section + .site-shell-section {
        border-top: 1px solid var(--border);
        margin-top: 1rem;
        padding-top: 1rem;
      }
      .site-shell-section-title {
        margin: 0 0 0.25rem;
        color: var(--muted);
        font-size: 0.69rem;
        font-weight: 700;
        text-transform: uppercase;
      }
      .site-shell-link {
        display: block;
        border-radius: 0.4rem;
        color: var(--muted);
        font-size: 0.86rem;
        font-weight: 600;
        line-height: 1.25rem;
        padding: 0.45rem 0.6rem;
        text-decoration: none;
      }
      .site-shell-link:hover,
      .site-shell-link[aria-current="page"] {
        background: var(--accent);
        color: var(--text);
      }
      .site-shell-context h2,
      .site-shell-context p {
        margin: 0;
      }
      .site-shell-context h2 {
        font-size: 1.05rem;
      }
      .site-shell-context-copy {
        color: var(--muted);
        font-size: 0.86rem;
        line-height: 1.55;
      }
      .site-shell-context-actions {
        display: grid;
        gap: 0.5rem;
        margin-top: 1rem;
      }
      .site-shell-mobile-nav {
        position: fixed;
        z-index: 20;
        right: 0;
        bottom: 0;
        left: 0;
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        min-height: 4.25rem;
        border-top: 1px solid var(--border);
        background: rgb(255 255 255 / 0.96);
        padding-bottom: env(safe-area-inset-bottom);
      }
      .site-shell-mobile-nav a {
        display: flex;
        min-width: 0;
        align-items: center;
        justify-content: center;
        color: var(--muted);
        font-size: 0.63rem;
        font-weight: 700;
        line-height: 1.15;
        padding: 0.5rem 0.2rem;
        text-align: center;
        text-decoration: none;
      }
      .site-shell-mobile-nav a[aria-current="page"] {
        color: var(--primary);
      }
      .site-shell-mobile-menu {
        display: none;
        align-items: center;
      }
      .site-shell-mobile-menu summary {
        cursor: pointer;
        font-size: 0.78rem;
        font-weight: 700;
        list-style: none;
        padding: 0.5rem;
      }
      .site-shell-mobile-menu summary::-webkit-details-marker {
        display: none;
      }
      .site-shell-mobile-menu-panel {
        position: fixed;
        z-index: 40;
        top: 3.5rem;
        bottom: 0;
        left: 0;
        width: min(20rem, 88vw);
        overflow-y: auto;
        border-right: 1px solid var(--border);
        background: var(--panel);
        color: var(--text);
        padding: 1rem;
        box-shadow: 1rem 0 2rem rgb(0 0 0 / 0.12);
      }
      .page {
        width: min(100%, 72rem);
        margin: 0 auto;
        padding: 2rem 1.25rem;
      }
      .topbar {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        justify-content: space-between;
        margin-bottom: 1.5rem;
      }
      .hero {
        display: grid;
        gap: 1.25rem;
        border-bottom: 1px solid var(--border);
        padding-bottom: 1.5rem;
      }
      .hero-copy {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 0.9rem;
      }
      .context-card {
        display: grid;
        gap: 1rem;
        align-self: start;
        border: 1px solid var(--border);
        border-radius: 0.5rem;
        background: var(--panel);
        padding: 1rem;
      }
      .button {
        align-self: flex-start;
        border: 1px solid var(--border);
        border-radius: 0.5rem;
        color: var(--text);
        padding: 0.45rem 0.7rem;
        text-decoration: none;
        font-size: 0.9rem;
        background: var(--panel);
      }
      .button:hover,
      .context-link:hover,
      .related-entry:hover {
        border-color: color-mix(in srgb, var(--primary) 45%, var(--border));
      }
      .inline-link {
        color: var(--primary);
        text-decoration: none;
      }
      .inline-link:hover {
        text-decoration: underline;
        text-underline-offset: 0.18rem;
      }
      .eyebrow,
      .meta,
      .body-copy,
      .dek,
      .section-label {
        color: var(--muted);
      }
      .eyebrow {
        margin: 0;
        font-size: 0.92rem;
        font-weight: 600;
      }
      .dek {
        margin: 0;
        max-width: 46rem;
        font-size: 1rem;
        line-height: 1.65;
      }
      h1 {
        margin: 0;
        font-size: 2rem;
        line-height: 1.05;
        letter-spacing: 0;
      }
      h2 {
        margin: 0;
        font-size: 1.05rem;
        letter-spacing: 0;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        font-size: 0.78rem;
      }
      .meta > * {
        border: 1px solid var(--border);
        border-radius: 0.45rem;
        padding: 0.3rem 0.5rem;
        background: var(--panel);
      }
      .fact-list {
        display: grid;
        gap: 0.75rem;
        margin: 0;
      }
      .fact {
        display: grid;
        gap: 0.15rem;
      }
      .fact dt {
        color: var(--muted);
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0;
        text-transform: uppercase;
      }
      .fact dd {
        margin: 0;
        font-size: 0.95rem;
        font-weight: 600;
        line-height: 1.35;
      }
      .article {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
        padding: 1.5rem 0;
      }
      .article p,
      .body-copy {
        margin: 0;
        font-size: 1rem;
        line-height: 1.75;
      }
      .article-body {
        display: grid;
        gap: 0.6rem;
        max-width: 48rem;
      }
      .section-label {
        margin: 0;
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0;
        text-transform: uppercase;
      }
      .photo {
        width: 100%;
        aspect-ratio: 16 / 9;
        object-fit: cover;
        border: 1px solid var(--border);
        border-radius: 0.5rem;
        background: var(--panel);
      }
      .related-context {
        display: grid;
        gap: 1rem;
        border-top: 1px solid var(--border);
        padding: 1.5rem 0 0;
      }
      .context-link-grid {
        display: grid;
        gap: 0.75rem;
      }
      .context-link,
      .related-entry {
        display: grid;
        gap: 0.25rem;
        border: 1px solid var(--border);
        border-radius: 0.5rem;
        background: var(--panel);
        color: var(--text);
        padding: 0.85rem;
        text-decoration: none;
      }
      .context-link span,
      .related-entry span,
      .related-entry small {
        color: var(--muted);
        font-size: 0.78rem;
        line-height: 1.45;
      }
      .context-link strong,
      .related-entry strong {
        font-size: 0.95rem;
        line-height: 1.35;
      }
      .related-list {
        display: grid;
        gap: 0.75rem;
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .engagement {
        display: grid;
        gap: 1rem;
        border-top: 1px solid var(--border);
        border-bottom: 1px solid var(--border);
        margin-top: 1.5rem;
        padding: 1.25rem 0;
      }
      .engagement-actions,
      .action-row,
      .comment-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: center;
        justify-content: space-between;
      }
      .action-row {
        justify-content: flex-start;
      }
      .comment-form,
      .reply-form,
      .comments,
      .comment {
        display: grid;
        gap: 0.75rem;
      }
      label {
        display: grid;
        gap: 0.4rem;
        font-size: 0.9rem;
        font-weight: 600;
      }
      textarea {
        width: 100%;
        min-height: 5rem;
        border: 1px solid var(--border);
        border-radius: 0.5rem;
        background: var(--panel);
        color: var(--text);
        font: inherit;
        line-height: 1.6;
        padding: 0.65rem 0.75rem;
      }
      ol.comments {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .comment {
        border: 1px solid var(--border);
        border-radius: 0.5rem;
        padding: 0.85rem;
        background: var(--panel);
      }
      .comment p,
      .muted {
        margin: 0;
      }
      .muted {
        color: var(--muted);
        font-size: 0.88rem;
      }
      .secondary {
        background: transparent;
      }
      @media (min-width: 640px) {
        h1 {
          font-size: 2.75rem;
        }
        .context-link-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
      @media (min-width: 960px) {
        .site-shell-grid {
          grid-template-columns: 14rem minmax(0, 1fr);
        }
        .site-shell-sidebar {
          position: sticky;
          top: 3.5rem;
          display: block;
          height: calc(100dvh - 3.5rem);
          overflow-y: auto;
          border-right: 1px solid var(--border);
          padding: 1.25rem 0.75rem;
        }
        .site-shell-content {
          padding-bottom: 0;
        }
        .site-shell-mobile-nav,
        .site-shell-mobile-menu {
          display: none;
        }
        .hero {
          grid-template-columns: minmax(0, 1fr) 22rem;
          align-items: start;
        }
      }
      @media (min-width: 1280px) {
        .site-shell-grid {
          grid-template-columns: 14rem minmax(0, 1fr) 18rem;
        }
        .site-shell-context {
          position: sticky;
          top: 3.5rem;
          display: block;
          height: calc(100dvh - 3.5rem);
          overflow-y: auto;
          border-left: 1px solid var(--border);
          padding: 1.5rem 1.25rem;
        }
      }
      @media (max-width: 959px) {
        .site-shell-header-inner {
          padding: 0 0.75rem;
        }
        .site-shell-mobile-menu {
          display: flex;
        }
        .site-shell-brand {
          width: auto;
          margin-left: 0.25rem;
        }
        .site-shell-header-actions .secondary-action {
          display: none;
        }
      }
    </style>
  </head>
  <body>
    <div class="site-shell" data-site-shell="raw">
      <header class="site-shell-header" data-site-shell-region="header">
        <div class="site-shell-header-inner">
          <details class="site-shell-mobile-menu">
            <summary aria-label="${escapeAttribute(navigation.labels.openMenu)}">${escapeHtml(navigation.labels.publicSection)}</summary>
            <div class="site-shell-mobile-menu-panel">
              <p class="site-shell-section-title">${escapeHtml(navigation.labels.menuTitle)}</p>
              <p class="site-shell-context-copy">${escapeHtml(navigation.labels.menuDescription)}</p>
              ${publicNavigation}
              ${personalNavigation}
              <a class="button secondary" href="${escapeAttribute(context.secondaryHref)}">${escapeHtml(context.secondaryLabel)}</a>
            </div>
          </details>
          <a class="site-shell-brand" href="${escapeAttribute(navigation.publicItems[0]?.href ?? "/")}">OverGarden</a>
          <div class="site-shell-header-actions">
            <a class="site-shell-header-action secondary-action" href="${escapeAttribute(navigation.searchHref)}">${escapeHtml(navigation.labels.search)}</a>
            ${sessionActions}
          </div>
        </div>
      </header>
      <div class="site-shell-grid">
        <aside class="site-shell-sidebar" data-site-shell-region="sidebar">
          ${publicNavigation}
          ${personalNavigation}
        </aside>
        <div class="site-shell-content" data-site-shell-region="content">
          ${body}
        </div>
        <aside class="site-shell-context" data-site-shell-region="context">
          <p class="site-shell-section-title">${escapeHtml(navigation.labels.contextTitle)}</p>
          <h2>${escapeHtml(context.title)}</h2>
          <p class="site-shell-context-copy">${escapeHtml(context.description)}</p>
          <div class="site-shell-context-actions">
            <a class="button" href="${escapeAttribute(context.primaryHref)}">${escapeHtml(context.primaryLabel)}</a>
            <a class="button secondary" href="${escapeAttribute(context.secondaryHref)}">${escapeHtml(context.secondaryLabel)}</a>
          </div>
        </aside>
      </div>
      <nav class="site-shell-mobile-nav" data-site-shell-region="mobile-navigation" aria-label="${escapeAttribute(navigation.labels.menuTitle)}">
        ${mobileNavigation}
      </nav>
    </div>
  </body>
</html>`;
}

function renderRawNavigationSection(
  label: string,
  items: readonly SiteShellNavigationItem[],
  pathname: string,
) {
  return `<section class="site-shell-section"><p class="site-shell-section-title">${escapeHtml(label)}</p>${items
    .map((item) => renderRawNavigationLink(item, pathname))
    .join("")}</section>`;
}

function renderRawMobileNavigation(
  items: readonly SiteShellNavigationItem[],
  pathname: string,
) {
  return items
    .map((item) => renderRawNavigationLink(item, pathname, true))
    .join("");
}

function renderRawNavigationLink(
  item: SiteShellNavigationItem,
  pathname: string,
  mobile = false,
) {
  const current = isSiteShellItemActive(pathname, item)
    ? ' aria-current="page"'
    : "";
  const className = mobile ? "" : ' class="site-shell-link"';

  return `<a${className} href="${escapeAttribute(item.href)}"${current}>${escapeHtml(item.label)}</a>`;
}

function formatDate(value: Date | string, locale: InterfaceLocale) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatLikeCount(count: number, locale: InterfaceLocale) {
  return formatPublicCount(locale, "like", count);
}

function summarize(value: string) {
  const singleLine = value.replace(/\s+/g, " ").trim();
  return singleLine.length > 150
    ? `${singleLine.slice(0, 147).trimEnd()}...`
    : singleLine;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
