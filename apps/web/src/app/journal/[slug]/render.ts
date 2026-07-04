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
  const title = `${page.entry.title} | OverGarden`;
  const description = summarize(page.entry.body);
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

  return renderShell({
    title,
    description,
    robots,
    canonicalPath: publicJournalEntryPath(page.entry.publicSlug),
    body: `
      <main class="page">
        <header class="header">
          <a class="button" href="/">OverGarden</a>
          <p class="eyebrow">
            ${escapeHtml(entryContextLabel)}
            ${page.entry.entryScope === "object" && varietyLink ? ` · ${varietyLink}` : page.entry.entryScope === "object" && page.plantObject.varietyText ? ` · ${escapeHtml(page.plantObject.varietyText)}` : ""}
          </p>
          <h1>${escapeHtml(page.entry.title)}</h1>
          <div class="meta">
            <time>${escapeHtml(formatDate(page.entry.entryDate))}</time>
            ${locationLabel ? `<span>${escapeHtml(locationLabel)}</span>` : ""}
          </div>
        </header>
        <article class="article">
          ${
            page.media
              ? `<img class="photo" src="${escapeAttribute(page.media.publicUrl)}" alt="${escapeAttribute(`${page.entry.title} photo`)}" width="960" height="540" />`
              : ""
          }
          <p>${escapeHtml(page.entry.body).replaceAll("\n", "<br />")}</p>
        </article>
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

function getPublicVarietyLink(page: PublicJournalEntryPage) {
  if (!page.plantObject.catalogPublicSlug) return null;

  const label =
    page.plantObject.catalogCanonicalName ??
    page.plantObject.varietyText ??
    "Variety";

  return `<a class="inline-link" href="${escapeAttribute(publicVarietyPath(page.plantObject.catalogPublicSlug))}">${escapeHtml(label)}</a>`;
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
        width: min(100%, 48rem);
        margin: 0 auto;
        padding: 2rem 1.25rem;
      }
      .header {
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
        border-bottom: 1px solid var(--border);
        padding-bottom: 1.25rem;
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
      .body-copy {
        color: var(--muted);
      }
      .eyebrow {
        margin: 0;
        font-size: 0.92rem;
        font-weight: 600;
      }
      h1 {
        margin: 0;
        font-size: 2rem;
        line-height: 1.05;
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
      .article {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
        padding-top: 1.5rem;
      }
      .article p,
      .body-copy {
        margin: 0;
        font-size: 1rem;
        line-height: 1.75;
      }
      .photo {
        width: 100%;
        aspect-ratio: 16 / 9;
        object-fit: cover;
        border: 1px solid var(--border);
        border-radius: 0.5rem;
        background: var(--panel);
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
