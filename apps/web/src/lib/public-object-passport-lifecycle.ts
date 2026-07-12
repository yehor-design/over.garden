import type { InterfaceLocale } from "@/lib/interface-localization";
import { getLivingObjectPassportCopy } from "@/lib/living-object-passport";
import { localizedPath } from "@/lib/public-localization";

const PUBLIC_OBJECT_PASSPORT_PATH =
  /^\/lineage\/objects\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/?$/i;

export function matchPublicObjectPassportPath(pathname: string) {
  return PUBLIC_OBJECT_PASSPORT_PATH.exec(pathname)?.[1] ?? null;
}

export function renderGonePublicObjectPassportHtml(locale: InterfaceLocale) {
  const copy = getLivingObjectPassportCopy(locale);
  return renderLifecycleDocument(
    locale,
    copy.passportRemoved,
    copy.passportRemovedDescription,
  );
}

export function renderNotFoundPublicObjectPassportHtml(
  locale: InterfaceLocale,
) {
  const copy = getLivingObjectPassportCopy(locale);
  return renderLifecycleDocument(
    locale,
    copy.passportNotFound,
    copy.passportNotFoundDescription,
  );
}

function renderLifecycleDocument(
  locale: InterfaceLocale,
  title: string,
  description: string,
) {
  const copy = getLivingObjectPassportCopy(locale);
  const objectsPath = localizedPath(locale, "/objects");

  return `<!doctype html>
<html lang="${escapeAttribute(locale)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${escapeHtml(title)} | OverGarden</title>
    <style>
      :root { --foreground: rgb(23 23 23); --background: rgb(255 255 255); --primary: rgb(47 125 50); --muted-foreground: rgb(102 102 102); --border: rgb(212 212 212); color-scheme: light; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--foreground); background: var(--background); }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; }
      header { height: 56px; display: flex; align-items: center; padding: 0 20px; color: var(--background); background: var(--foreground); font-weight: 700; }
      header span { display: inline-flex; height: 56px; align-items: center; padding: 0 18px; background: var(--primary); }
      main { width: min(760px, 100%); margin: 0 auto; padding: 40px 20px; }
      h1 { margin: 0; font-size: 2rem; line-height: 1.15; }
      p { max-width: 42rem; margin: 16px 0 0; color: var(--muted-foreground); line-height: 1.65; }
      a { display: inline-flex; margin-top: 24px; border: 1px solid var(--border); border-radius: 6px; padding: 10px 14px; color: inherit; font-weight: 650; text-decoration: none; }
      a:hover { border-color: var(--primary); color: var(--primary); }
    </style>
  </head>
  <body>
    <header><span>OverGarden</span></header>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
      <a href="${escapeAttribute(objectsPath)}">${escapeHtml(copy.browseObjects)}</a>
    </main>
  </body>
</html>`;
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
  return escapeHtml(value);
}
