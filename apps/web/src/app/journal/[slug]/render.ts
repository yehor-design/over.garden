import {
  publicJournalEntryPath,
  publicVarietyPath,
} from "@/lib/garden/public-paths";
import { getCoarseRegionLabel } from "@/lib/garden/regions";
import type { PublicJournalEntryPage } from "@/server/journal-repository";
import type {
  EngagementTarget,
  PublicEngagementSummary,
} from "@/server/engagement-repository";
import {
  evaluatePublicSurfaceIndexability,
  formatRobotsMetaContent,
} from "@/server/public-surface-indexing-policy";

// Pure HTML renderers for the public journal route. They live in their own
// module so the public-facing bytes can be unit/privacy tested without the
// Next.js route runtime. The route handler only adds the HTTP response shell.

export function renderPublicJournalEntryHtml(
  page: PublicJournalEntryPage,
  engagement?: PublicEngagementSummary,
  engagementStatus?: string | null,
) {
  const title = `${page.entry.title} logbook entry | OverGarden`;
  const description = summarize(
    `${page.entry.title}. ${page.plantObject.displayName}. ${page.entry.body}`,
  );
  const robots = formatRobotsMetaContent(
    evaluatePublicSurfaceIndexability({
      kind: "journal_entry",
      publicNoindex: page.entry.publicNoindex,
    }),
  );
  const locationLabel = getPublicJournalLocationLabel(page);
  const varietyLink = getPublicVarietyLink(page);
  const entryContextLabel =
    page.entry.entryScope === "space"
      ? `Space entry · ${page.space.displayName}`
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
    body: `
      <main class="page logbook-page">
        <nav class="topbar" aria-label="Primary">
          <a class="button secondary" href="/">OverGarden</a>
          ${objectPassportPath ? `<a class="button secondary" href="${escapeAttribute(objectPassportPath)}">Object passport</a>` : ""}
        </nav>
        <header class="hero">
          <div class="hero-copy">
            <p class="eyebrow">Living-object logbook entry</p>
            <h1>${escapeHtml(page.entry.title)}</h1>
            <p class="dek">${escapeHtml(entryContextLabel)}${page.entry.entryScope === "object" && page.plantObject.varietyText ? ` · ${escapeHtml(page.plantObject.varietyText)}` : ""}</p>
            <div class="meta" aria-label="Entry metadata">
              <time>${escapeHtml(formatDate(page.entry.entryDate))}</time>
              <span>${escapeHtml(page.entry.entryScope === "space" ? "Space logbook" : "Object logbook")}</span>
              ${locationLabel ? `<span>${escapeHtml(locationLabel)}</span>` : `<span>Location hidden</span>`}
            </div>
            <div class="action-row">
              ${
                objectPassportPath
                  ? `<a class="button" href="${escapeAttribute(objectPassportPath)}">Open living-object passport</a>`
                  : ""
              }
              <a class="button secondary" href="${escapeAttribute(guestStartPath)}">Start a comparable journal</a>
            </div>
          </div>
          <aside class="context-card" aria-labelledby="journal-context-title">
            <h2 id="journal-context-title">Journal context</h2>
            <dl class="fact-list">
              ${renderFact(page.entry.entryScope === "space" ? "Space" : "Living object", page.entry.entryScope === "space" ? page.space.displayName : page.plantObject.displayName)}
              ${renderFact("Catalog identity", getCatalogContextLabel(page))}
              ${renderFact("Public location", locationLabel ?? "Hidden")}
              ${renderFact("Caretaker", page.author?.displayName ?? "OverGarden gardener")}
            </dl>
          </aside>
        </header>
        <article class="article" aria-label="Journal entry">
          ${
            page.media
              ? `<img class="photo" src="${escapeAttribute(page.media.publicUrl)}" alt="${escapeAttribute(`${page.entry.title} photo`)}" width="960" height="540" />`
              : ""
          }
          <div class="article-body">
            <p class="section-label">Entry note</p>
            <p>${escapeHtml(page.entry.body).replaceAll("\n", "<br />")}</p>
          </div>
        </article>
        ${renderRelatedPublicContext(page, varietyLink)}
        ${
          engagement
            ? renderEngagementHtml({
                target: engagement.target,
                summary: engagement,
                returnTo: publicJournalEntryPath(page.entry.publicSlug),
                status: engagementStatus,
              })
            : ""
        }
      </main>
    `,
  });
}

export function getPublicJournalLocationLabel(page: PublicJournalEntryPage) {
  if (page.entry.entryScope === "space") {
    if (page.space.locationVisibility !== "region") return null;
    const label = getCoarseRegionLabel(page.space.coarseRegionCode);
    return label ? `Region: ${label}` : null;
  }

  if (page.plantObject.locationVisibility !== "region") return null;

  const code =
    page.plantObject.coarseRegionCode ??
    (page.space.locationVisibility === "region"
      ? page.space.coarseRegionCode
      : null);
  const label = getCoarseRegionLabel(code);

  return label ? `Region: ${label}` : null;
}

export function renderGoneJournalEntryHtml(publicSlug: string) {
  return renderShell({
    title: "Entry removed | OverGarden",
    description: "This public garden journal entry has been removed.",
    robots: "noindex, nofollow",
    canonicalPath: publicJournalEntryPath(publicSlug),
    body: `
      <main class="page">
        <header class="header">
          <a class="button" href="/">OverGarden</a>
          <h1>Entry removed</h1>
          <p class="body-copy">This public garden journal entry has been removed.</p>
        </header>
      </main>
    `,
  });
}

export function renderNotFoundJournalEntryHtml() {
  return renderShell({
    title: "Entry not found | OverGarden",
    description: "This garden journal entry is not available.",
    robots: "noindex, nofollow",
    body: `
      <main class="page">
        <header class="header">
          <a class="button" href="/">OverGarden</a>
          <h1>Entry not found</h1>
          <p class="body-copy">This garden journal entry is not available.</p>
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

function getCatalogContextLabel(page: PublicJournalEntryPage) {
  if (page.plantObject.catalogCanonicalName) {
    return page.plantObject.catalogCanonicalName;
  }

  if (page.plantObject.varietyText) {
    return page.plantObject.varietyText;
  }

  return page.entry.entryScope === "space"
    ? "Space-level update"
    : "Catalog match pending";
}

function renderRelatedPublicContext(
  page: PublicJournalEntryPage,
  varietyLink: string | null,
) {
  const contextLinks = [
    page.plantObject.publicPath
      ? renderContextLink({
          label: "Object passport",
          value: page.plantObject.displayName,
          href: page.plantObject.publicPath,
        })
      : null,
    varietyLink
      ? renderContextLink({
          label: "Catalog match",
          value:
            page.plantObject.catalogCanonicalName ??
            page.plantObject.varietyText ??
            "Public variety",
          href: getPublicVarietyHref(page) ?? "",
        })
      : null,
    page.author
      ? renderContextLink({
          label: "Caretaker profile",
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
            <span>${escapeHtml(formatDate(entry.entryDate))}</span>
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
        <p class="section-label">Related public context</p>
        <h2 id="related-context-title">Follow the object history</h2>
      </div>
      ${
        contextLinks.length > 0
          ? `<div class="context-link-grid">${contextLinks.join("")}</div>`
          : ""
      }
      ${
        relatedEntries
          ? `<ol class="related-list">${relatedEntries}</ol>`
          : ""
      }
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

function getPublicVarietyLink(page: PublicJournalEntryPage) {
  const href = getPublicVarietyHref(page);
  if (!href) return null;

  const label =
    page.plantObject.catalogCanonicalName ??
    page.plantObject.varietyText ??
    "Variety";

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

function renderEngagementHtml({
  target,
  summary,
  returnTo,
  status,
}: {
  target: EngagementTarget;
  summary: PublicEngagementSummary;
  returnTo: string;
  status?: string | null;
}) {
  return `
    <section class="engagement">
      <div class="engagement-actions">
        <div class="action-row">
          ${renderActionForm({
            action: "/api/engagement/likes",
            target,
            returnTo,
            label: "Like",
          })}
          ${renderActionForm({
            action: "/api/engagement/bookmarks",
            target,
            returnTo,
            label: "Bookmark",
          })}
        </div>
        <p class="muted">${summary.activeLikeCount} like${summary.activeLikeCount === 1 ? "" : "s"}</p>
      </div>
      ${status ? `<p class="muted">${escapeHtml(engagementStatusMessage(status))}</p>` : ""}
      <form method="post" action="/api/engagement/comments" class="comment-form">
        ${renderTargetFields(target, returnTo)}
        <label>
          <span>Comment</span>
          <textarea name="body" maxlength="600" rows="3"></textarea>
        </label>
        <button class="button" type="submit">Comment</button>
      </form>
      ${
        summary.comments.length === 0
          ? `<p class="muted">No comments yet.</p>`
          : `<ol class="comments">${summary.comments
              .map(
                (comment) => `
                  <li class="comment">
                    <div class="comment-meta">
                      <strong>${escapeHtml(comment.authorLabel)}</strong>
                      <time>${escapeHtml(formatDate(comment.createdAt))}</time>
                    </div>
                    ${comment.parentReplyToken ? `<p class="muted">Reply</p>` : ""}
                    <p>${escapeHtml(comment.body).replaceAll("\n", "<br />")}</p>
                    <form method="post" action="/api/engagement/comments" class="reply-form">
                      ${renderTargetFields(target, returnTo)}
                      <input type="hidden" name="parentCommentId" value="${escapeAttribute(comment.replyToken)}" />
                      <label>
                        <span>Reply</span>
                        <textarea name="body" maxlength="600" rows="2"></textarea>
                      </label>
                      <button class="button secondary" type="submit">Reply</button>
                    </form>
                  </li>
                `,
              )
              .join("")}</ol>`
      }
    </section>
  `;
}

function renderActionForm({
  action,
  target,
  returnTo,
  label,
}: {
  action: string;
  target: EngagementTarget;
  returnTo: string;
  label: string;
}) {
  return `
    <form method="post" action="${escapeAttribute(action)}">
      ${renderTargetFields(target, returnTo)}
      <button class="button" type="submit">${escapeHtml(label)}</button>
    </form>
  `;
}

function renderTargetFields(target: EngagementTarget, returnTo: string) {
  return `
    <input type="hidden" name="targetKind" value="${escapeAttribute(target.kind)}" />
    <input type="hidden" name="targetRef" value="${escapeAttribute(target.ref)}" />
    <input type="hidden" name="returnTo" value="${escapeAttribute(returnTo)}" />
  `;
}

function engagementStatusMessage(status: string) {
  switch (status) {
    case "liked":
      return "Liked.";
    case "unliked":
      return "Like removed.";
    case "like-rate-limited":
      return "Too many like toggles. Try again later.";
    case "bookmarked":
      return "Saved to bookmarks.";
    case "bookmark-removed":
      return "Removed from bookmarks.";
    case "commented":
      return "Comment posted.";
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
}: {
  title: string;
  description: string;
  robots: string;
  canonicalPath?: string;
  body: string;
}) {
  return `<!doctype html>
<html lang="en">
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
        --border: rgb(215 222 214);
        --muted: rgb(102 113 100);
        --text: rgb(23 32 21);
        --bg: rgb(251 253 248);
        --panel: rgb(255 255 255);
        --primary: rgb(29 95 56);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
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
        .hero {
          grid-template-columns: minmax(0, 1fr) 22rem;
          align-items: start;
        }
      }
    </style>
  </head>
  <body>
    ${body}
  </body>
</html>`;
}

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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
